using System.Collections.Concurrent;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using CodeMetrics.AI.Probes;
using FluentAssertions;

namespace CodeMetrics.AI.Tests.Probes;

public sealed class ConfiguredNuGetFeedTests
{
    [Fact]
    public async Task EnvironmentCredentials_AreUsedByNuGet()
    {
        using var folder = new SettingsFolder();
        await using var feed = new TestFeed();
        var name = "Private" + Guid.NewGuid().ToString("N");
        folder.Configure(feed.Url, false);
        var configPath = System.IO.Path.Combine(folder.Path, "NuGet.Config");
        File.WriteAllText(configPath, File.ReadAllText(configPath).Replace("key=\"Private\"", $"key=\"{name}\""));
        var variable = "NuGetPackageSourceCredentials_" + name;
        Environment.SetEnvironmentVariable(variable, $"Username=aws;Password={TestFeed.Password};ValidAuthenticationTypes=Basic");
        try
        {
            var result = await Assess(folder.Path, feed.Url);
            result.Failures.Should().BeEmpty();
            result.Results.Values.Should().Equal(true);
        }
        finally
        {
            Environment.SetEnvironmentVariable(variable, null);
        }
    }

    [Fact]
    public async Task MalformedConfiguration_RemainsUnknownWithoutLeakingItsContents()
    {
        using var folder = new SettingsFolder();
        File.WriteAllText(System.IO.Path.Combine(folder.Path, "NuGet.Config"), "<configuration>" + TestFeed.Password);
        var result = await Assess(folder.Path, "");
        result.Results.Should().BeEmpty();
        result.Failures.Should().ContainSingle();
        JsonSerializer.Serialize(result.Failures).Should().NotContain(TestFeed.Password).And.NotContain(folder.Path);
    }

    [Fact]
    public async Task ConfiguredCredentials_AuthenticateIndexAndUncachedCandidate()
    {
        using var folder = new SettingsFolder();
        await using var feed = new TestFeed();
        folder.Configure(feed.Url, credentials: true);
        var result = await Assess(folder.Path, feed.Url);
        result.Results.Values.Should().Equal(true);
        result.Failures.Should().BeEmpty();
        feed.AuthenticatedPaths.Should().Contain("/index.json").And.Contain("/flat/private.example/2.0.0/private.example.2.0.0.nupkg");
    }

    [Theory]
    [InlineData(false, 200)]
    [InlineData(true, 404)]
    public async Task InaccessibleCandidate_RemainsUnknownAndDoesNotExposeCredentials(bool credentials, int packageStatus)
    {
        using var folder = new SettingsFolder();
        await using var feed = new TestFeed(packageStatus: packageStatus);
        folder.Configure(feed.Url, credentials);
        var result = await Assess(folder.Path, feed.Url);
        result.Results.Should().BeEmpty();
        result.Failures.Should().ContainSingle();
        var diagnostic = JsonSerializer.Serialize(result.Failures);
        diagnostic.Should().NotContain(TestFeed.Password).And.NotContain(feed.Url);
        diagnostic.Should().Contain(credentials ? "packageHttpStatus:404" : "sourceIndexHttpStatus:401");
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task UnmappedOrDisabledFeed_IsNeverContacted(bool unmapped, bool disabled)
    {
        using var folder = new SettingsFolder();
        await using var feed = new TestFeed();
        folder.Configure(feed.Url, true, pattern: unmapped ? "Other.*" : "*", disabled: disabled);
        var result = await Assess(folder.Path, feed.Url);
        result.Results.Should().BeEmpty();
        result.Failures.Should().ContainSingle();
        feed.Requests.Should().Be(0);
    }

    [Fact]
    public async Task MostSpecificMapping_DoesNotLeakPrivatePackageToPublicFallback()
    {
        using var folder = new SettingsFolder();
        await using var privateFeed = new TestFeed(packageStatus: 404);
        await using var publicFeed = new TestFeed();
        folder.Configure(privateFeed.Url, true);
        var configPath = System.IO.Path.Combine(folder.Path, "NuGet.Config");
        var config = XDocument.Load(configPath);
        config.Root!.Element("packageSources")!.Add(new XElement("add", new XAttribute("key", "Public"), new XAttribute("value", publicFeed.Url)));
        config.Root.Element("packageSourceMapping")!.Add(new XElement("packageSource", new XAttribute("key", "Public"), new XElement("package", new XAttribute("pattern", "*"))));
        config.Save(configPath);
        var result = await Assess(folder.Path, privateFeed.Url + "\n" + publicFeed.Url);
        result.Results.Should().BeEmpty();
        publicFeed.Requests.Should().Be(0);
    }

    [Fact]
    public async Task SamePackageInDifferentProjects_UsesEachProjectsConfiguration()
    {
        using var first = new SettingsFolder();
        using var second = new SettingsFolder();
        await using var compatible = new TestFeed(framework: "net8.0");
        await using var incompatible = new TestFeed(framework: "net10.0");
        first.Configure(compatible.Url, true);
        second.Configure(incompatible.Url, true);
        var a = new OutdatedPackageUpgrade(System.IO.Path.Combine(first.Path, "a.csproj"), "net9.0", "Private.Example", "2.0.0");
        var b = new OutdatedPackageUpgrade(System.IO.Path.Combine(second.Path, "b.csproj"), "net9.0", "Private.Example", "2.0.0");
        var result = await PackageFrameworkCompatibility.AssessAsync([a, b], compatible.Url + "\n" + incompatible.Url,
            TestContext.Current.CancellationToken, workingDirectory: first.Path);
        result.Failures.Should().BeEmpty();
        result.Results[a].Should().BeTrue();
        result.Results[b].Should().BeFalse();
        result.UniquePackageVersions.Should().Be(1);
    }

    [Fact]
    public async Task ConfiguredGlobalPackagesFolder_IsUsedWithoutNetwork()
    {
        using var folder = new SettingsFolder();
        await using var feed = new TestFeed();
        folder.Configure(feed.Url, true);
        var packageDir = System.IO.Path.Combine(folder.Path, "packages", "private.example", "2.0.0");
        Directory.CreateDirectory(packageDir);
        await File.WriteAllBytesAsync(System.IO.Path.Combine(packageDir, "private.example.2.0.0.nupkg"), TestFeed.Package("net8.0"), TestContext.Current.CancellationToken);
        var result = await Assess(folder.Path, feed.Url);
        result.Results.Values.Should().Equal(true);
        feed.Requests.Should().Be(0);
    }

    [Fact]
    public async Task Cancellation_StopsHelperAndPropagates()
    {
        using var folder = new SettingsFolder();
        await using var feed = new TestFeed(stall: true);
        folder.Configure(feed.Url, true);
        using var cancellation = new CancellationTokenSource();
        var operation = PackageFrameworkCompatibility.AssessAsync(
            [new(null, "net10.0", "Private.Example", "2.0.0")], feed.Url, cancellation.Token, workingDirectory: folder.Path);
        await feed.FirstRequest.Task.WaitAsync(TimeSpan.FromSeconds(15), TestContext.Current.CancellationToken);
        cancellation.Cancel();
        var action = async () => await operation.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        await action.Should().ThrowAsync<OperationCanceledException>();
    }

    private static Task<PackageCompatibilityAssessment> Assess(string directory, string sources) =>
        PackageFrameworkCompatibility.AssessAsync([new(null, "net10.0", "Private.Example", "2.0.0")], sources,
            TestContext.Current.CancellationToken, workingDirectory: directory);

    private sealed class SettingsFolder : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "codetestament-feed-" + Guid.NewGuid().ToString("N"));
        public SettingsFolder() => Directory.CreateDirectory(Path);
        public void Configure(string source, bool credentials, string pattern = "Private.*", bool disabled = false)
        {
            var root = new XElement("configuration",
                new XElement("packageSources", new XElement("clear"), new XElement("add", new XAttribute("key", "Private"), new XAttribute("value", source))),
                new XElement("config", new XElement("add", new XAttribute("key", "globalPackagesFolder"), new XAttribute("value", System.IO.Path.Combine(Path, "packages")))),
                new XElement("packageSourceMapping", new XElement("clear"), new XElement("packageSource", new XAttribute("key", "Private"), new XElement("package", new XAttribute("pattern", pattern)))));
            if (credentials) root.Add(new XElement("packageSourceCredentials", new XElement("Private",
                new XElement("add", new XAttribute("key", "Username"), new XAttribute("value", "aws")),
                new XElement("add", new XAttribute("key", "ClearTextPassword"), new XAttribute("value", TestFeed.Password)),
                new XElement("add", new XAttribute("key", "ValidAuthenticationTypes"), new XAttribute("value", "basic")))));
            if (disabled) root.Add(new XElement("disabledPackageSources", new XElement("add", new XAttribute("key", "Private"), new XAttribute("value", "true"))));
            new XDocument(root).Save(System.IO.Path.Combine(Path, "NuGet.Config"));
        }
        public void Dispose() => Directory.Delete(Path, recursive: true);
    }

    private sealed class TestFeed : IAsyncDisposable
    {
        public const string Password = "fixture-token-not-a-real-secret";
        private readonly TcpListener listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource cancellation = new();
        private readonly Task loop;
        private readonly ConcurrentBag<Task> connections = [];
        private readonly string framework;
        private readonly int packageStatus;
        private readonly bool stall;
        private int requests;
        public int Requests => requests;
        public string Url { get; }
        public ConcurrentBag<string> AuthenticatedPaths { get; } = [];
        public TaskCompletionSource FirstRequest { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TestFeed(string framework = "net8.0", int packageStatus = 200, bool stall = false)
        {
            this.framework = framework;
            this.packageStatus = packageStatus;
            this.stall = stall;
            listener.Start();
            Url = $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/index.json";
            loop = Accept();
        }
        private async Task Accept()
        {
            try
            {
                while (!cancellation.IsCancellationRequested)
                    connections.Add(Respond(await listener.AcceptTcpClientAsync(cancellation.Token)));
            }
            catch (OperationCanceledException) { }
        }
        private async Task Respond(TcpClient client)
        {
            using (client)
            {
                try
                {
                    var stream = client.GetStream();
                    using var reader = new StreamReader(stream, leaveOpen: true);
                    var first = await reader.ReadLineAsync(cancellation.Token);
                    if (first == null) return;
                    var path = first.Split(' ')[1];
                    string? line;
                    var authenticated = false;
                    while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync(cancellation.Token)))
                        authenticated |= line.Equals("Authorization: Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes("aws:" + Password)), StringComparison.OrdinalIgnoreCase);
                    Interlocked.Increment(ref requests);
                    FirstRequest.TrySetResult();
                    if (stall) await Task.Delay(Timeout.Infinite, cancellation.Token);
                    if (authenticated) AuthenticatedPaths.Add(path);
                    var status = !authenticated ? 401 : path == "/index.json" ? 200 : packageStatus;
                    var body = status != 200 ? [] : path == "/index.json"
                        ? Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { version = "3.0.0", resources = new[] { new Dictionary<string, string> { ["@id"] = Url.Replace("index.json", "flat/"), ["@type"] = "PackageBaseAddress/3.0.0" } } }))
                        : Package(framework);
                    var headers = $"HTTP/1.1 {status} Result\r\nContent-Length: {body.Length}\r\nConnection: close\r\n" + (status == 401 ? "WWW-Authenticate: Basic realm=\"private-feed\"\r\n" : "") + "\r\n";
                    await stream.WriteAsync(Encoding.ASCII.GetBytes(headers), cancellation.Token);
                    await stream.WriteAsync(body, cancellation.Token);
                }
                catch (OperationCanceledException) { }
                catch (IOException) when (cancellation.IsCancellationRequested) { }
            }
        }
        public static byte[] Package(string framework)
        {
            using var bytes = new MemoryStream();
            using (var zip = new ZipArchive(bytes, ZipArchiveMode.Create, leaveOpen: true))
                zip.CreateEntry($"lib/{framework}/Private.Example.dll");
            return bytes.ToArray();
        }
        public async ValueTask DisposeAsync()
        {
            await cancellation.CancelAsync();
            await loop;
            listener.Stop();
            await Task.WhenAll(connections);
            cancellation.Dispose();
        }
    }
}
