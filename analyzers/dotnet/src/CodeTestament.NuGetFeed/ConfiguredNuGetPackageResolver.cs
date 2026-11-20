using NuGet.Common;
using NuGet.Configuration;
using NuGet.Credentials;
using NuGet.Protocol;
using NuGet.Protocol.Core.Types;

namespace CodeMetrics.AI.Probes;

/// <summary>Uses the target's NuGet settings and authentication without restoring or executing packages.</summary>
internal sealed class ConfiguredNuGetPackageResolver
{
    private static readonly object CredentialSetupLock = new();
    private readonly IReadOnlyList<PackageSource> sources;
    private readonly PackageSourceMapping mapping;
    private readonly string globalPackages;

    internal ConfiguredNuGetPackageResolver(string directory, string[] reportedSources)
    {
        var settings = Settings.LoadDefaultSettings(directory, null, new XPlatMachineWideSetting());
        mapping = PackageSourceMapping.GetPackageSourceMapping(settings);
        globalPackages = SettingsUtility.GetGlobalPackagesFolder(settings);
        sources = SelectSources(new PackageSourceProvider(settings).LoadPackageSources().ToArray(),
            reportedSources);
        lock (CredentialSetupLock)
            DefaultCredentialServiceUtility.SetupDefaultCredentialService(NullLogger.Instance, nonInteractive: true);
    }

    private IReadOnlyList<PackageSource> SelectSources(IReadOnlyList<PackageSource> configured, string[] locations)
    {
        var selected = configured.Where(source => source.IsEnabled &&
            (locations.Length == 0 || locations.Any(location => SameSource(source.Source, location)))).ToList();
        // RestoreSources can supply a source outside NuGet.config. Never invent a mapping name
        // or re-enable a disabled source. Only un-mapped reports can add anonymous sources.
        if (!mapping.IsEnabled)
            selected.AddRange(locations.Where(location => !configured.Any(source => SameSource(source.Source, location)))
                .Select(location => new PackageSource(location)));
        return selected;
    }

    private static bool SameSource(string first, string second) =>
        Uri.TryCreate(first, UriKind.Absolute, out var left) && Uri.TryCreate(second, UriKind.Absolute, out var right)
            ? left.Equals(right)
            : string.Equals(first, second, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    internal async Task<PackageFrameworkSet?> FindAsync(string package, string version,
        CancellationToken cancellationToken, Action<string> reportFailure)
    {
        var allowed = mapping.GetConfiguredPackageSources(package);
        var eligible = sources.Where(source => !mapping.IsEnabled || allowed.Contains(source.Name, StringComparer.OrdinalIgnoreCase)).ToArray();
        if (mapping.IsEnabled && eligible.Length == 0)
        {
            reportFailure("packageSourceMappingNoMatch");
            return null;
        }
        var local = LocalPackageFrameworkResolver.Find(package, version,
            eligible.Where(source => !source.IsHttp).Select(source => source.Source).ToArray(), globalPackages);
        if (local != null) return local;
        if (eligible.Length == 0) reportFailure("noConfiguredPackageSource");
        // codemetrics-ignore: awaitedIoInsideLoop -- ordered, mapped NuGet source fallback.
        foreach (var source in eligible.Where(source => source.IsHttp))
        {
            var result = await FindAtSourceAsync(source, package, version, cancellationToken, reportFailure);
            if (result != null) return result;
        }
        return null;
    }

    private static async Task<PackageFrameworkSet?> FindAtSourceAsync(PackageSource source, string package,
        string version, CancellationToken cancellationToken, Action<string> reportFailure)
    {
        // The same NuGet handler owns authentication for the service index, package and range requests.
        var repository = Repository.Factory.GetCoreV3(source);
        var handler = await repository.GetResourceAsync<HttpHandlerResource>(cancellationToken);
        using var client = new HttpClient((handler ?? throw new InvalidOperationException()).MessageHandler) { Timeout = TimeSpan.FromSeconds(10) };
        var addresses = await NuGetServiceIndexClient.FindPackageBaseAddressesAsync(
            [source.SourceUri], cancellationToken, reportFailure, client);
        return await NuGetPackageClient.FindFrameworksAsync(package, version, addresses,
            cancellationToken, reportFailure, client);
    }
}
