# CodeTestament 0.7.0: nine-dimension JS/TS scoring

This release implements scoring for all nine JavaScript/TypeScript dimensions.
Architecture, Testing, Security, Documentation and Dependency Management now
have explicit policies. Code Quality becomes Complexity & Decomposition, with
both component scores retained. Error Handling scores classified handler bodies
and discloses unknown bodies separately instead of discarding the entire score.

Every score includes its population, executed decision and limits. Nine supported
dimensions does not guarantee nine available scores: missing dependencies,
unsupported lockfiles or empty eligible populations remain unavailable. Testing
is a static assessment, Security covers bounded source patterns, and Documentation
measures discoverable guidance. None establishes runtime correctness.

```sh
npm exec --yes --package=codetestament@0.7.0 -- codetestament --project package.json --dependency-metadata --scorecard-output scorecard-070.json
```

Use a new output path for each run. `--dependency-metadata` requests public npm
health information and is required for Dependency Management when dependencies
exist. Private or unavailable metadata never becomes a clean score. Offline
analysis remains supported, with dependency health unavailable.

The package includes the [complete scoring policy](../../analyzers/javascript-typescript/SCORING.md)
as `dist/SCORING.md`. It documents formulas, thresholds, rounding, exclusions,
recognition limits and evidence requirements. These are initial product policies;
cross-ecosystem equivalence and defect prediction are not established.

The new ruleset is `javascript-typescript-2026-11-24-nine-dimensions`. Generate
fresh baselines from the original source revision with the same version and
settings used for the branch. Preserve historical evidence. Policy changes do
not demonstrate code improvement, and 0.6.x comparisons are rejected.

Python remains adapter 0.15.0 with at most two scored dimensions; Python Error
Handling remains unscored. .NET remains CodeTestament.Scorecard 2.4.3.
The skill default is promoted after registry installation checks pass.

Validation includes analyzer tests, installed npm package checks, isolated skill
tests, mixed .NET/JS/Python audits, historical imports, and Express/Zod source
assessments. See the [validation record](../validation/javascript-typescript-0.7.0.md).
