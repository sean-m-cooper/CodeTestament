using System.Text.Json;
using CodeMetrics.AI.Probes;

// Only a bounded metadata response crosses the process boundary. Credential-provider
// logs and configuration exception messages must never enter scorecard evidence.
Console.SetError(TextWriter.Null);
var output = Console.Out;
Console.SetOut(TextWriter.Null);
var reasons = new List<string>();
PackageFrameworkSet? frameworks = null;
try
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
    var request = JsonSerializer.Deserialize<PackageFeedRequest>(await Console.In.ReadLineAsync(timeout.Token) ?? throw new InvalidDataException())
        ?? throw new InvalidDataException();
    frameworks = await new ConfiguredNuGetPackageResolver(request.Directory, request.Sources)
        .FindAsync(request.Package, request.Version, timeout.Token, reasons.Add);
}
catch (OperationCanceledException)
{
    reasons.Add("packageBudgetExceeded");
}
catch (Exception exception)
{
    reasons.Add("configuredSource:" + exception.GetType().Name);
}
await output.WriteLineAsync(JsonSerializer.Serialize(new PackageFeedResponse(frameworks, reasons.Distinct().ToArray())));
