namespace CodeMetrics.AI.Probes;

internal sealed class NuGetPackageFrameworkResolver(
    IReadOnlyList<Uri> packageBaseAddresses,
    IReadOnlyList<string> localSources,
    IReadOnlyList<string> sourceDiagnostics,
    HttpClient? client = null)
{
    public static async Task<NuGetPackageFrameworkResolver> CreateAsync(
        string commandOutput,
        CancellationToken cancellationToken,
        HttpClient? client = null)
    {
        var packageSources = PackageSourceParser.Parse(commandOutput);
        var sourceDiagnostics = new List<string>();
        var packageBaseAddresses = await NuGetServiceIndexClient.FindPackageBaseAddressesAsync(
            packageSources.HttpSources,
            cancellationToken, sourceDiagnostics.Add, client);
        return new NuGetPackageFrameworkResolver(
            packageBaseAddresses,
            packageSources.LocalSources, sourceDiagnostics, client);
    }

    public async Task<PackageFrameworkSet?> FindAsync(
        string package,
        string version,
        CancellationToken cancellationToken,
        Action<string>? reportFailure = null)
    {
        var normalizedPackage = package.ToLowerInvariant();
        var normalizedVersion = NormalizeVersion(version);
        var local = LocalPackageFrameworkResolver.Find(
            normalizedPackage,
            normalizedVersion,
            localSources);
        if (local != null) return local;
        foreach (var diagnostic in sourceDiagnostics) reportFailure?.Invoke(diagnostic);
        return await NuGetPackageClient.FindFrameworksAsync(
            normalizedPackage,
            normalizedVersion,
            packageBaseAddresses,
            cancellationToken, reportFailure, client);
    }

    private static string NormalizeVersion(string version)
    {
        var metadataIndex = version.IndexOf('+');
        return (metadataIndex >= 0 ? version[..metadataIndex] : version).ToLowerInvariant();
    }
}
