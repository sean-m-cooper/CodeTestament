using CodeMetrics.AI.Probes;
using CodeMetrics.AI.Tests.Helpers;
using FluentAssertions;

namespace CodeMetrics.AI.Tests.Probes;

public class SecurityContextTests
{
    private static DimensionResult Analyze(string code)
    {
        var (_, _, compilation) = RoslynTestHelper.CompileCodeAtPath(code, Path.Combine(Path.GetTempPath(), "CodeMetricsContext", "Context.cs"));
        compilation.GetDiagnostics().Where(d => d.Severity == Microsoft.CodeAnalysis.DiagnosticSeverity.Error).Should().BeEmpty();
        return SecurityProbe.Analyze([("Context", compilation)]);
    }

    [Theory]
    [InlineData("ForgotPasswordConfirmationPath", "ForgotPasswordConfirmation")]
    [InlineData("ResetPasswordConfirmationPath", "ResetPasswordConfirmation")]
    [InlineData("DatabaseConnectionString", "DatabaseConnectionString")]
    [InlineData("TokenProtector", "OrchardCore.UserStore.Token")]
    [InlineData("AuthenticatorKeyTokenName", "AuthenticatorKey")]
    [InlineData("ResetPassword", "OrchardCore.Users.ResetPassword")]
    [InlineData("PasswordAuthentication", "password-authentication")]
    [InlineData("PasswordRecovery", "password-recovery")]
    [InlineData("_changePasswordConfirmationUrl", "ChangePasswordConfirmation")]
    [InlineData("PaymentCardTokenRecordType", "paymentcardtoken")]
    public void DescriptiveIdentifier_IsNotACredential(string name, string value)
    {
        Analyze($$"""class C { string {{name}} = "{{value}}"; void M() { {{name}} = "{{value}}"; } }""")
            .Findings.Should().NotContain(f => f.Category == "hardcodedSecret");
    }

    [Theory]
    [InlineData("PasswordPath", "r4ndomCredentialValue0123")]
    [InlineData("TokenName", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")]
    [InlineData("DatabaseConnectionString", "Server=db;Password=realcredential")]
    [InlineData("TokenProtector", "abcdefghijklmnop")]
    [InlineData("PaymentCardTokenRecordType", "r4ndomCredentialValue0123")]
    [InlineData("PaymentCardTokenRecordType", "anothercredentialvalue")]
    public void IdentifierSuffix_DoesNotHideCredentials(string name, string value)
    {
        Analyze($$"""class C { string {{name}} = "{{value}}"; }""")
            .Findings.Should().ContainSingle(f => f.Category == "hardcodedSecret");
    }

    [Fact]
    public void RecordTypeConstant_IsADescriptiveIdentifier()
    {
        var result = Analyze("""
            class C
            {
                private const string PaymentCardTokenRecordType = "paymentcardtoken";
            }
            """);
        result.Findings.Should().NotContain(f => f.Category == "hardcodedSecret");
        result.Score.Should().Be(10);
    }

    [Theory]
    [InlineData("CMAI4001 -- AWS secret identifier; value is retrieved at runtime.", false)]
    [InlineData("cmai4001 — Reviewed secret-store identifier.", false)]
    [InlineData("CMAI4001", true)]
    [InlineData("CMAI4001 -- ", true)]
    [InlineData("CMAI5001 -- Different rule.", true)]
    [InlineData("CMAI4002 -- Different security rule.", true)]
    [InlineData("hardcodedSecret -- Reviewed identifier.", true)]
    [InlineData("all -- Reviewed identifier.", true)]
    [InlineData("* -- Reviewed identifier.", true)]
    [InlineData("", true)]
    public void SecretIdentifierAnnotation_RequiresSpecificCodeAndRationale(string directive, bool found)
    {
        var result = Analyze($$"""
            class C {
                void M() {
                    // codemetrics-ignore: {{directive}}
                    const string secret = "FortisPayment.Settings";
                    GetSecretOrConfig(secret, "userId");
                    GetSecretOrConfig(secret, "userApiKey");
                }
                static string GetSecretOrConfig(string name, string field) => name;
            }
            """);
        result.Findings.Any(f => f.Category == "hardcodedSecret").Should().Be(found);
        result.Score.Should().Be(found ? 2 : 10);
    }

    [Theory]
    [InlineData("const string secret = \"FortisPayment.Settings\";")]
    [InlineData("secret = \"FortisPayment.Settings\";")]
    public void SecretIdentifierAnnotation_DoesNotSuppressAdjacentCredentials(string statement)
    {
        var result = Analyze($$"""
            class C {
                string secret;
                void M() {
                    // codemetrics-ignore: CMAI4001 -- AWS secret identifier; value is retrieved at runtime.
                    {{statement}}
                    string apiKey = "actualCredentialValue1234";
                }
            }
            """);
        result.Findings.Should().ContainSingle(f => f.Category == "hardcodedSecret")
            .Which.Message.Should().Contain("apiKey");
    }

    [Fact]
    public void MemberSecretAnnotation_DoesNotSuppressOtherMembersOrSecurityRules()
    {
        var result = Analyze("""
            class C {
                // codemetrics-ignore: CMAI4001 -- AWS secret identifier; value is retrieved at runtime.
                void M(string input) {
                    const string secret = "FortisPayment.Settings";
                    ExecuteSql($"SELECT {input}");
                }
                void Other() { const string password = "actualCredentialValue1234"; }
                static void ExecuteSql(string sql) {}
            }
            """);
        result.Findings.Should().ContainSingle(f => f.Category == "hardcodedSecret")
            .Which.Message.Should().Contain("password");
        result.Findings.Should().ContainSingle(f => f.Category == "rawSqlInterpolation");
    }

    private const string CorsTypes = """
        class Builder {
            public Builder AllowAnyOrigin() => this;
            public Builder AllowCredentials() => this;
        }
        class Options { public void AddPolicy(string name, System.Action<Builder> configure) {} }
        class Policy { public bool AllowAnyOrigin; public bool AllowCredentials; }
        """;

    [Theory]
    [InlineData("b.AllowAnyOrigin().AllowCredentials();", true)]
    [InlineData("b.AllowAnyOrigin(); b.AllowCredentials();", true)]
    [InlineData("b.AllowAnyOrigin(); c.AllowCredentials();", false)]
    [InlineData("if (flag) b.AllowAnyOrigin(); else b.AllowCredentials();", false)]
    public void Cors_TracksBuilderAndBranches(string body, bool found)
    {
        var result = Analyze(CorsTypes + "class C { void M(Builder b, Builder c, bool flag) { " + body + " } }");
        result.Findings.Any(f => f.Category == "allowAnyOriginWithCredentials").Should().Be(found);
    }

    [Theory]
    [InlineData("if (p.AllowCredentials && p.AllowAnyOrigin) continue;", false)]
    [InlineData("if (p.AllowCredentials && p.AllowAnyOrigin) { System.Console.WriteLine(1); continue; }", false)]
    [InlineData("if (p.AllowCredentials && p.AllowAnyOrigin) { System.Console.WriteLine(1); }", true)]
    [InlineData("if (p.AllowCredentials && p.AllowAnyOrigin) continue; p.AllowAnyOrigin = true;", true)]
    [InlineData("if (p.AllowCredentials && other.AllowAnyOrigin) continue;", true)]
    [InlineData("", true)]
    public void Cors_OnlyAnApplicableRejectingGuardRemovesFinding(string guard, bool found)
    {
        var result = Analyze(CorsTypes + $$"""
            class C { void M(Options options, Policy[] policies, Policy other) {
                foreach (var p in policies) {
                    {{guard}}
                    options.AddPolicy("one", b => {
                        if (p.AllowAnyOrigin) b.AllowAnyOrigin();
                        if (p.AllowCredentials) b.AllowCredentials();
                    });
                }
            } }
            """);
        result.Findings.Any(f => f.Category == "allowAnyOriginWithCredentials").Should().Be(found);
    }

    [Fact]
    public void SeparatePolicies_DoNotCombineConfiguration()
    {
        Analyze(CorsTypes + """
            class C { void M(Options o) {
                o.AddPolicy("public", b => b.AllowAnyOrigin());
                o.AddPolicy("private", b => b.AllowCredentials());
            } }
            """).Findings.Should().NotContain(f => f.Category == "allowAnyOriginWithCredentials");
    }
}
