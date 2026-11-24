using CodeMetrics.AI.Probes;
using CodeMetrics.AI.Tests.Helpers;
using FluentAssertions;
using Microsoft.CodeAnalysis;
using Microsoft.EntityFrameworkCore;

namespace CodeMetrics.AI.Tests.Probes;

public class EfCoreSqlSecurityTests
{
    [Theory]
    [InlineData("db.Set<Photo>().FromSql($\"SELECT * FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Set<Photo>().FromSqlInterpolated($\"SELECT * FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Database.ExecuteSql($\"DELETE FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Database.ExecuteSqlAsync($\"DELETE FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Database.ExecuteSqlInterpolated($\"DELETE FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Database.ExecuteSqlInterpolatedAsync($\"DELETE FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Database.SqlQuery<int>($\"SELECT Id FROM Photos WHERE Id = {id}\");")]
    [InlineData("RelationalQueryableExtensions.FromSql(db.Set<Photo>(), $\"SELECT * FROM Photos WHERE Id = {id}\");")]
    [InlineData("RelationalDatabaseFacadeExtensions.ExecuteSqlInterpolatedAsync(sql: $\"DELETE FROM Photos WHERE Id = {id}\", databaseFacade: db.Database);")]
    [InlineData("RelationalDatabaseFacadeExtensions.SqlQuery<int>(db.Database, $\"SELECT Id FROM Photos WHERE Id = {id}\");")]
    [InlineData("FormattableString sql = $\"DELETE FROM Photos WHERE Id = {id}\"; db.Database.ExecuteSql(sql);")]
    [InlineData("db.Database.ExecuteSqlRaw(\"DELETE FROM Photos WHERE Name = {0}\", $\"prefix-{id}\");")]
    [InlineData("db.Set<Photo>().FromSqlRaw(\"SELECT * FROM Photos WHERE Name = {0}\", \"prefix-\" + id);")]
    [InlineData("db.Database.SqlQueryRaw<int>(\"SELECT Id FROM Photos WHERE Name = {0}\", $\"prefix-{id}\");")]
    [InlineData("await db.Set<Photo>().FromSqlInterpolated($\"SELECT * FROM Photos WITH (UPDLOCK, HOLDLOCK) WHERE Id = {id} AND Name = {id}\").IgnoreQueryFilters().Include(p => p.Parent).FirstOrDefaultAsync(ct);")]
    [InlineData("await db.Database.ExecuteSqlInterpolatedAsync($\"UPDATE Folders SET NetworkFolder = {id}, WebFolder = {id} WHERE Id = {id} AND (NetworkFolder IS NULL OR LTRIM(RTRIM(NetworkFolder)) = N'')\", ct);")]
    [InlineData("RelationalDatabaseFacadeExtensions.ExecuteSqlRaw(parameters: new object[] { $\"prefix-{id}\" }, sql: \"DELETE FROM Photos WHERE Name = {0}\", databaseFacade: db.Database);")]
    public void ParameterizedEfCalls_DoNotLowerSecurityScore(string statement)
    {
        var result = AnalyzeEf(statement);
        result.Findings.Should().NotContain(f => f.Category == "rawSqlInterpolation");
        result.Score.Should().Be(10);
    }

    [Theory]
    [InlineData("db.Set<Photo>().FromSqlRaw($\"SELECT * FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Set<Photo>().FromSqlRaw(\"SELECT * FROM Photos WHERE Id = \" + id);")]
    [InlineData("db.Database.ExecuteSqlRaw($\"DELETE FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Database.ExecuteSqlRawAsync($\"DELETE FROM Photos WHERE Id = {id}\");")]
    [InlineData("db.Database.SqlQueryRaw<int>($\"SELECT Id FROM Photos WHERE Id = {id}\");")]
    [InlineData("RelationalDatabaseFacadeExtensions.SqlQueryRaw<int>(db.Database, $\"SELECT Id FROM Photos WHERE Id = {id}\");")]
    [InlineData("RelationalDatabaseFacadeExtensions.ExecuteSqlRaw(sql: $\"DELETE FROM Photos WHERE Id = {id}\", databaseFacade: db.Database);")]
    [InlineData("db.Database.ExecuteSqlRaw($\"DELETE FROM Photos WHERE Id = {id} AND Name = {{0}}\", \"name\");")]
    public void RawEfCalls_WithSqlConstruction_RemainFindings(string statement)
    {
        var result = AnalyzeEf(statement);
        result.Findings.Should().ContainSingle(f => f.Category == "rawSqlInterpolation" && f.Severity == "error");
        result.Score.Should().Be(2);
    }

    [Theory]
    [InlineData("string")]
    [InlineData("System.FormattableString")]
    public void CustomMethodNamedLikeEf_IsNotExempt(string parameterType)
    {
        var (_, _, compilation) = RoslynTestHelper.CompileCode($$"""
            class Custom {
                void ExecuteSqlInterpolated({{parameterType}} sql) { }
                void Run(string value) { ExecuteSqlInterpolated($"SELECT {value}"); }
            }
            """);
        Analyze(compilation).Findings.Should().ContainSingle(f => f.Category == "rawSqlInterpolation");
    }

    [Fact]
    public void EfNamespaceLookalike_IsNotExempt()
    {
        var (_, _, compilation) = RoslynTestHelper.CompileCode("""
            namespace Microsoft.EntityFrameworkCore {
                static class RelationalDatabaseFacadeExtensions {
                    public static void ExecuteSqlInterpolated(System.FormattableString sql) { }
                }
            }
            class Repository {
                void Run(string value) {
                    Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions.ExecuteSqlInterpolated($"SELECT {value}");
                }
            }
            """);
        Analyze(compilation).Findings.Should().ContainSingle(f => f.Category == "rawSqlInterpolation");
    }

    private static DimensionResult AnalyzeEf(string statement)
    {
        var (_, _, compilation) = RoslynTestHelper.CompileCode($$"""
            using System;
            using Microsoft.EntityFrameworkCore;
            class Photo { public int Id { get; set; } public Photo Parent { get; set; } }
            class Repository {
                async System.Threading.Tasks.Task Run(DbContext db, string id, System.Threading.CancellationToken ct) { {{statement}} }
            }
            """, new[] {
                typeof(DbContext).Assembly, typeof(RelationalDatabaseFacadeExtensions).Assembly,
                typeof(System.Linq.Expressions.Expression).Assembly, typeof(IQueryable<>).Assembly
            }.Distinct().Select(a => MetadataReference.CreateFromFile(a.Location)).ToArray());
        compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).Should().BeEmpty();
        return Analyze(compilation);
    }

    private static DimensionResult Analyze(Compilation compilation) =>
        SecurityProbe.Analyze(new List<(string, Compilation)> { ("EfFixture", compilation) });
}
