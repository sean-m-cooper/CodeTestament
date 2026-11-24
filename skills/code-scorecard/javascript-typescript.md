# JS/TS nine-dimension policy (0.7.0)

Use this guidance when the evidence ruleset is
`javascript-typescript-2026-11-24-nine-dimensions`. Older evidence retains its
recorded scores and unsupported dimensions; do not backfill it with this policy.

Preserve emitted decisions. All nine dimensions have implementations, but absent
populations and unavailable evidence can still leave dimensions unscored.
Report the assessed count, scope and unavailable reason rather than promising 9/9.

- Display Code Quality as **Complexity & Decomposition**, with both component
  scores. Method Complexity is in `componentDetails.methodComplexity`; its
  per-function contributions now live in that component's `scoring`. Owned
  statements drive Decomposition, not physical lines. Size and coupling are
  review signals, not proof of incorrect responsibilities.
- Architecture scores implementation-target concentration. Re-export surfaces,
  type-only references and cycles add no deductions. Show hotspot/eligible
  modules, worst fan-out and graph resolution gaps.
- Error Handling scores only assessed bodies. Show **assessed / total handlers**,
  unknown bodies and unresolved callback uses alongside the score. Unknowns
  receive neither credit nor penalty. Do not describe a 10 on a small assessed
  subset as complete exception-handling validation.
- Testing measures static declarations and direct assertion signals. Show active,
  skipped, placeholder and unresolved counts. A score of 10 is not evidence that
  tests passed or that coverage is sufficient. Custom assertion helpers may be
  outside the recognizer's scope.
- Security measures the emitted bounded source patterns only. A dynamic-code or
  shell site is a trust-boundary review lead, not a confirmed injection exploit.
  Missing detections do not establish application security.
- Dependency Management requires complete inventory and requested metadata when
  dependencies exist. For a full connected scorecard, pass `--dependency-metadata`
  and disclose the public-registry queries. Honor offline requests; report that
  dependency health is unavailable in offline mode. Private metadata, unsupported
  locks and failed requests remain unavailable. Do not substitute inventory
  consistency for a health score. Retain exact-pin and outside-range exclusions.
- Documentation measures README and usage/testing guidance signals, not prose
  correctness or API documentation coverage.

The package ships `dist/SCORING.md` with all ladders, rule IDs, formulae, exclusions
and the baseline migration boundary. Treat policies as product choices, not
empirical defect probabilities. Do not compare these scores numerically with
.NET or Python scores as if their scopes were equivalent.
