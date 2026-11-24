# Portable JS/TS baselines: 0.5.2 and 0.6.0-preview.4

Equivalent configurations now produce the same fingerprint across worktrees when
TypeScript resolves an option to the repository root itself. This fixes settings
such as `baseUrl: "."`, `rootDir: "."`, `rootDirs` and inherited workspace settings.
Paths beneath the root remain relative in the fingerprint; external paths retain
their identity. Absolute checkout locations remain available as evidence provenance.

Stable `codetestament@0.5.2` contains the JS/TS fix. The opt-in
`codetestament@0.6.0-preview.4` bundle includes the same correction and retains the
Python 0.15.0 preview. Python Error Handling remains unscored. .NET stays at 2.4.2.
Numerical scoring policies, rulesets and raw measurements are unchanged.

## Adopt the fix

Update the CodeTestament plugin and reload the host. Plugin 0.2.4 selects stable
JS/TS 0.5.2 and preview 0.6.0-preview.4. Existing supported exact repository pins
remain honored; update those pins explicitly to adopt this release.

For direct use:

```sh
npm exec --yes --package=codetestament@0.5.2 -- codetestament --help
```

Regenerate the baseline from its original source revision and analyze the current
revision with the same corrected analyzer version and settings. Older affected
hashes cannot be safely repaired from evidence alone. Do not edit historical hashes
or bypass compatibility checks to manufacture a passing gate. Compiler settings,
source selection, external paths, tool versions and scope differences still reject
comparison.

Regression tests cover separate checkout directories, inherited workspace settings,
meaningful configuration changes and external paths. Installed-package tests run
an actual cross-worktree comparison with quality gates enabled.
