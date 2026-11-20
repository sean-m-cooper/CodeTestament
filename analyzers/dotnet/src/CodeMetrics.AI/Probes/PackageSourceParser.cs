namespace CodeMetrics.AI.Probes;

internal sealed record PackageSources(
    IReadOnlyList<Uri> HttpSources,
    IReadOnlyList<string> LocalSources);

internal static class PackageSourceParser
{
    public static PackageSources Parse(string commandOutput)
    {
        var sourceLines = SplitLines(commandOutput)
            .Select(line => line.Trim())
            .ToList();
        if (PackageReport.IsJson(commandOutput))
        {
            using var document = PackageReport.ParseDocument(commandOutput);
            sourceLines = document.RootElement.TryGetProperty("sources", out var sources)
                ? sources.EnumerateArray().Select(source => source.GetString() ?? "").ToList()
                : [];
        }
        var httpSources = sourceLines
            .Select(line => Uri.TryCreate(line, UriKind.Absolute, out var uri) ? uri : null)
            .Where(uri => uri?.Scheme is "http" or "https")
            .Cast<Uri>()
            .Distinct()
            .ToList();
        var localSources = sourceLines
            .Where(Directory.Exists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return new PackageSources(httpSources, localSources);
    }

    private static IEnumerable<string> SplitLines(string text)
    {
        return string.IsNullOrEmpty(text)
            ? []
            : text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries);
    }
}
