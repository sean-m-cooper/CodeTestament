# JavaScript/TypeScript scoring, 0.7.0

Ruleset: `javascript-typescript-2026-11-24-nine-dimensions`.
These are initial product policies, not empirically calibrated defect probabilities.
All nine dimensions have scoring implementations. A score still requires the
corresponding evidence: unavailable is neither zero nor ten. All scopes are partial.
The schema remains v3. Generate new baselines from the original revision using
the same analyzer version, policy and settings; do not edit historical evidence.

## Scores and populations

| Dimension | Population and policy | Limits |
| --- | --- | --- |
| Architecture & SOLID | Implementation modules; distinct literal value-dependency targets, including external targets. Threshold 10. Score = `10 - min(6,12*hotspots/modules) - min(4,2*max(0,worstFanOut/10-1))`. | Measures coupling concentration, not SOLID compliance. Type-only references and re-export-only modules are excluded. Cycles remain informational, with no deduction. Dynamic references and resolution gaps are disclosed. |
| Complexity & Decomposition | Mean of Method Complexity and Decomposition component scores. Method Complexity retains the CC 3/5/10/20/40 → 10/8/6/4/0 ladder, one worst function 40%, remainder 60%. Decomposition uses owned executable statements 10/20/40/80/160 → 10/8/6/4/0, weakest ceil(N/5) 40%, remainder 60%. | Linear interpolation. One function uses its own score. Nested function bodies count once, in their own function. Physical lines, erased types, enum members and literal-data entries are not size penalties. Size does not establish separate business responsibilities. |
| Testing | Conventional test files, including files outside production tsconfig. Recognized Node test, Jest, Vitest and Mocha declarations; Node assert, expect matchers and source-bound Supertest expectations. `(8*activeTests + 2*directAssertionBearingTests)/assessedTests`. Skipped and placeholder tests stay in the denominator. | Static test signals only, not execution, coverage or correctness. Referenced callbacks and unsupported declaration forms are unresolved. Assertions in custom helpers can be missed. No test files gives 0; test files with no assessable declarations give unavailable. Report discovered files, recognized/assessed tests and diagnostics. |
| Security | 10 without the bounded patterns below; cap 6 for nonliteral standard code/shell execution, cap 2 for embedded private-key blocks. Repeated sites do not multiply the cap. | No taint analysis or claims about authentication, authorization, SQL injection or XSS. A nonliteral value is a review signal, not proof of attacker control. Credentials are never copied into findings. |
| Error Handling | `min(10 - 10*unexplainedSwallowing/assessedHandlers, unexplainedSwallowing>0 ? 9 : 10)`. | Only classified distinct bodies enter the denominator. Unknown bodies and unresolved uses get neither credit nor penalty. Always show assessed/total bodies, unknown bodies and unresolved uses; the score does not describe those excluded cases. Zero assessed bodies is unavailable. Documented intent is honored. |
| Dependency Management | Complete npm v2/v3 or pnpm v9 inventory and successful requested metadata. For each distinct package/name/version/source, loss is max(4 if deprecated, 2 if an update exists within a declared range). Health = 10 minus mean loss; caps: 8 if any deprecation, 9 if any within-range update. Advisory caps: critical 0, high 2, moderate 4, low 6. Final = minimum of health and caps. | Explicit exact pins and outside-range major upgrades do not incur an update penalty. Deduplicate installations/peer variants. Runtime exploitability and upgrade compatibility are not established. Missing lockfiles, unsupported managers, private/unavailable metadata or query-budget omissions yield no dimension score. An empty complete dependency population scores 10 without a network request. |
| Async/Blocking Usage | Existing affected/eligible-owner rate ladder remains unchanged. | Zero eligible owners is unavailable; synchronous padding adds no credit. Not a runtime-speed measurement. |
| Maintainability | Existing owned-function MI ladder and weakest-quintile weighting remain unchanged. | Exclusive bodies; not a change-cost estimate. |
| Documentation | Each production package: substantive README (at least 40 non-formatting characters) 4 points; usage/install/example heading or text signal 3; testing/contributing/verification signal 3. Mean package score. A repository README can document nested packages. | Measures discoverable project guidance, not truth, prose quality or API documentation completeness. Missing guidance gives 0. File contents and observed booleans support each decision. |

Arithmetic uses decimal rational values and half-up rounding to one decimal.
C&D averages the two reported component scores. Findings identify aggregate
policy inputs, not additional independent point deductions. Evidence contains
the inputs, decision and component populations needed to explain each score.

## Security recognition

The initial source-pattern rules are:

| Rule ID suffix (under `javascript-typescript/security/`) | Recognition |
| --- | --- |
| `dynamicCodeExecution` | Standard global eval/Function or imported Node VM execution APIs with nonliteral code. |
| `dynamicShellCommand` | Imported Node child_process exec/execSync with a nonliteral command, or supported execFile/spawn forms with explicit shell:true and nonliteral command/inline arguments. |
| `embeddedPrivateKey` | A complete private-key PEM block in production source. Evidence omits the key material. |

Recognize lexical imports, aliases and unmodified CommonJS requires; local lookalike
methods and shadowed globals do not qualify. Bounded const literal aliases and
literal concatenation/interpolation are recognized as static. Arbitrary value
flow, option aliases, dynamic member access and runtime monkey-patching are not
resolved. Names such as `secret` or `token` alone never establish a credential.
Node documents the shell-input boundary in its
[child-process API](https://nodejs.org/api/child_process.html#child_processexeccommand-options-callback).

## Acquiring dependency evidence

Analysis remains offline unless `--dependency-metadata` is supplied. This option
queries public npm metadata and sends eligible public package names/versions to
the bulk advisory endpoint. Private sources are excluded from these requests;
their unavailable health is disclosed. Network failures never turn into a clean
dependency score. Requests are bounded to 500 distinct names, four concurrent
requests, a 60-second scheduling budget, ten seconds per request and 20 MiB per
response. Offline inventory consistency remains visible as a separate
observation and cannot stand in for package health.

## Scope and release status

This policy changes score meaning and population; 0.6.0 comparisons are rejected.
Python remains on its separate 0.15.0 adapter and two scored dimensions. .NET
policies are unchanged. Cross-ecosystem scores remain uncalibrated. See the
[0.7.0 release notes](https://github.com/sean-m-cooper/CodeTestament/blob/master/docs/releases/javascript-typescript-0.7.0.md)
for installation and migration instructions.
