# CodeTestament Scorecard 2.4.2

Candidate-package framework inspection now uses NuGet authentication. Private-feed
projects can reuse their NuGet configuration credentials, source-credential environment
variables and installed credential providers, including the AWS CodeArtifact provider.
Previously, package listing could succeed while the separate metadata downloader failed.

- Respect each project's configured sources, package-source mapping and global cache.
- Authenticate service-index, package and bounded range requests through NuGet.
- Keep missing or inaccessible candidate metadata unknown; do not deduct points for it.
- Return redacted failure classifications rather than credential-bearing diagnostics.
- Bundle an isolated feed helper to preserve Roslyn/MSBuild SDK assembly resolution.

```sh
dotnet tool update --global CodeTestament.Scorecard --version 2.4.2
```

Read the [private-feed setup and troubleshooting guide](../private-nuget-feeds.md).
The numerical scoring ladders, evidence schema and ruleset are unchanged. A previously
unavailable dependency score can become available when candidate metadata is accessible.
No npm package changes are required.

Validation includes authenticated local-feed regressions, source mapping, per-project
configuration, missing candidates, redaction, cancellation and an installed-package
download smoke test. AMP's private AWS account is not part of automated validation.
