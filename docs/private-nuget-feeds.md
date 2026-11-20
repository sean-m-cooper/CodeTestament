# Private NuGet feeds

Starting with CodeTestament.Scorecard 2.4.2, candidate-framework inspection uses
NuGet's configuration and authentication pipeline. Previously, `dotnet list package`
could authenticate successfully while the separate candidate downloader could not.

Run the scorecard as the same user and in the same environment that can restore
the project. The analyzer reads the NuGet configuration hierarchy for each project,
including enabled sources, source credentials, package-source mapping and the global
packages folder. It also supports NuGet's source-credential environment variables
and installed cross-platform NuGet credential providers. Authentication is
noninteractive: complete any required sign-in before running a scorecard.

## AWS CodeArtifact

Use the existing CodeArtifact NuGet source and authentication setup. CodeTestament
does not require its own AWS token or a new copy of the credentials. AWS recommends
its NuGet credential provider, which refreshes expiring CodeArtifact tokens:

```sh
dotnet tool install --global AWS.CodeArtifact.NuGet.CredentialProvider
dotnet codeartifact-creds install
```

Follow [AWS's setup instructions](https://docs.aws.amazon.com/codeartifact/latest/ug/nuget-cli.html)
for source configuration, profiles and replacing credentials previously added by
`aws codeartifact login`. An existing, valid login-generated NuGet configuration is
also supported. Do not paste tokens into prompts or scorecard reports.

## Interpreting failures

An HTTP 404 does not establish whether a package is absent or hidden by the feed's
access policy. Check that the candidate version is accessible using the same NuGet
source and identity. A successful restore may only establish access to the installed
version, or may have used a local cache.

Failures retain bounded classifications such as `packageHttpStatus:404`,
`sourceIndexHttpStatus:401`, `packageSourceMappingNoMatch` or
`configuredSource:NuGetConfigurationException`. They do not include raw configuration,
credential-provider output or exception messages. Unavailable candidate metadata
remains unknown and withholds the dependency score; it is not an incompatible upgrade
or a code defect. Other dependency observations retain their existing behavior.

The helper is bundled with the analyzer and runs separately to avoid loading NuGet
client assemblies into Roslyn/MSBuild's SDK assembly context. It inspects package
metadata only. Existing download, range-read, concurrency and cancellation limits
remain in effect. NuGet v3 HTTP feeds and existing local package sources are supported;
this change does not add legacy v2 feed support.

See also [NuGet authentication and credential precedence](https://learn.microsoft.com/en-us/nuget/consume-packages/consuming-packages-authenticated-feeds).
