# CodeTestament 0.6.0

`codetestament@0.6.0` is the stable npm release for JavaScript, TypeScript and
Python. It promotes the 0.6.0-preview.4 bundle to the `latest` channel; it does
not change numerical scoring policies or add scores to unscored evidence.

Compared with stable 0.5.2, the package includes the Python analyzer and explicit
coverage collector, npm/pnpm dependency inventory, and the optional public-registry
dependency metadata probe. Dependency Management remains unscored for JS/TS.
Metadata requests require `--dependency-metadata`; target code is not executed.

Python requires Python 3.12 and retains adapter version 0.15.0. It scores Method
Complexity and Async/Blocking Usage when eligible implementations exist, giving
at most 2/9 scored dimensions. Error Handling and the remaining dimensions stay
unscored. Ordinary Python analysis does not import or execute target code; the
separate coverage collector explicitly runs tests in a caller-supplied environment.

```sh
npm exec --yes --package=codetestament@0.6.0 -- codetestament --project package.json
npm exec --yes --package=codetestament@0.6.0 -- codetestament-python --project pyproject.toml --scorecard-output python-evidence.json
```

Plugin 0.3.0 selects 0.6.0 for JS/TS, Python and shared evidence tooling. .NET
remains CodeTestament.Scorecard 2.4.3. Update the plugin and reload the host.
Supported exact repository pins remain authoritative and must be changed
explicitly to adopt this release. The historical npm `preview` tag remains
available; normal installation uses `latest` and the skill uses exact versions.

Regenerate incompatible JS/TS baselines from their original source revisions
using the same analyzer version and settings as the current branch. Preserve
historical evidence; changing package versions is not evidence of code improvement.
Cross-ecosystem score calibration remains incomplete.
