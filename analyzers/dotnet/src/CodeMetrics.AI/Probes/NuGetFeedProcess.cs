using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace CodeMetrics.AI.Probes;

/// <summary>Isolates NuGet's client assemblies from MSBuildLocator's SDK assembly resolution.</summary>
internal static class NuGetFeedProcess
{
    internal static string ContextDirectory(string? project, string root) =>
        project?.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) == true
            ? Path.GetDirectoryName(Path.GetFullPath(project, root))!
            : Path.GetFullPath(root);

    internal static async Task<PackageFrameworkSet?> FindAsync(string directory, string commandOutput,
        string package, string version, CancellationToken cancellationToken, Action<string> reportFailure)
    {
        var helper = Path.Combine(AppContext.BaseDirectory, "NuGetFeedHelper", "CodeTestament.NuGetFeed.dll");
        if (!File.Exists(helper))
        {
            reportFailure("nugetFeedHelperMissing");
            return null;
        }
        var start = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = directory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.ArgumentList.Add(helper);
        foreach (var key in new[] { "MSBUILD_EXE_PATH", "MSBuildSDKsPath", "MSBuildExtensionsPath" })
            start.Environment.Remove(key);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Cannot start NuGet feed helper.");
        try
        {
            var sources = PackageSourceParser.Parse(commandOutput);
            var request = new PackageFeedRequest(directory,
                sources.HttpSources.Select(uri => uri.AbsoluteUri).Concat(sources.LocalSources).ToArray(), package, version);
            var stdout = ReadBoundedAsync(process.StandardOutput, cancellationToken);
            var stderr = ReadBoundedAsync(process.StandardError, cancellationToken);
            await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(request).AsMemory(), cancellationToken);
            process.StandardInput.Close();
            await Task.WhenAll(stdout, stderr, process.WaitForExitAsync(cancellationToken));
            if (process.ExitCode != 0)
            {
                reportFailure("nugetFeedHelperFailed");
                return null;
            }
            var response = JsonSerializer.Deserialize<PackageFeedResponse>(await stdout) ?? throw new InvalidDataException();
            foreach (var reason in response.Reasons) reportFailure(reason);
            return response.Frameworks;
        }
        finally
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync(CancellationToken.None);
            }
        }
    }

    private static async Task<string> ReadBoundedAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        var result = new StringBuilder();
        var buffer = new char[4096];
        int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), cancellationToken)) > 0)
        {
            if (result.Length + count > 65536) throw new InvalidDataException("NuGet feed helper output exceeded its limit.");
            result.Append(buffer, 0, count);
        }
        return result.ToString();
    }
}
