namespace CodeMetrics.AI.Probes;

internal sealed record PackageFeedRequest(string Directory, string[] Sources, string Package, string Version);
internal sealed record PackageFeedResponse(PackageFrameworkSet? Frameworks, IReadOnlyList<string> Reasons);
