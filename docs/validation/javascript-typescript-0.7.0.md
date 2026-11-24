# JS/TS 0.7.0 validation

Local validation on 2026-11-24, based on master `d7d84cdb03778b40bec334ec5aff6584645865db`
plus the nine-dimension changes. These results precede registry publication.

- Full analyzer suite: 278 tests passed. The subsequent focused suite passed 14
  tests, including an added regression for stable test identities across line movement.
- Installed skill integration: 38 tests passed, including a nine-score report,
  mixed-language audits, unchanged Python scoring and evidence freshness controls.
- Cross-brand migration: 7 tests passed, including legacy 0.2.0 producers.
- Isolated plugin export: verified 99 tracked files; 21 offline tests passed.
- Installed npm package and architecture corpus checks passed.
- Six pinned calibration fixtures passed with the new expected distributions;
  existing labeled rules retained zero false positives and false negatives.

## Real-project evidence

These are static, partial assessments; tests in the target repositories were not
executed. All used ruleset `javascript-typescript-2026-11-24-nine-dimensions`.

| Dimension | Analyzer source | Express | Zod |
| --- | ---: | ---: | ---: |
| Architecture | 7.2 | 8.6 | 10 |
| Complexity & Decomposition | 7.6 | 8.5 | 7.7 |
| Testing | 10 | 9.7 | 9.6 |
| Security | 10 | 10 | 10 |
| Error Handling | 10 | 10 | 3.7 |
| Dependency Management | 0 | Unavailable | Unavailable |
| Async/Blocking Usage | 10 | 10 | 10 |
| Maintainability | 7.2 | 7.2 | 6.7 |
| Documentation | 10 | 10 | 10 |

The analyzer-source dependency score reflects reported advisory severity, not a
failed registry probe: metadata was available for all 112 inventory entries.
Express lacked a supported lockfile; Zod used an unsupported package manager.
Those gaps did not become invented scores. Zod's Error Handling assessment
covered 35 of 51 distinct handler bodies; 16 unknown bodies received neither
credit nor penalty. Twenty-two assessed bodies swallowed without recognized rationale.

| Project | Source revision | Run ID |
| --- | --- | --- |
| Analyzer source | Working tree described above | `14a3171f-14cd-4af7-8fd1-135141aadaab` |
| Express | `7ef98448f8b38099ab1ded55e458538ad47a51e7` | `e5011887-0493-444d-a184-d2efbf0a71f4` |
| Zod | `0b216ef674e297ebe41d8bf902262e56f8755822` | `527273d9-d630-42a8-a1eb-0e2b7f443092` |

Local artifacts: `TestResults/corpus/*-final.json`,
`TestResults/calibration/final.json`, `skill-integration-final.log`,
`migration-validation-final.log` and `plugin-validation.log`.
They are generated validation outputs, not source-controlled fixtures.

## Published release verification

- Release commit: `791d564e55e07daa1fede0cd286055bee22493e5`, tag `js-v0.7.0`.
- [CI](https://github.com/sean-m-cooper/CodeTestament/actions/runs/45494147567)
  and [Windows/Linux skill integration](https://github.com/sean-m-cooper/CodeTestament/actions/runs/45494147414)
  passed before merging. Node 20/22 and the Python coverage-version matrix passed.
- [npm publication and channel verification](https://github.com/sean-m-cooper/CodeTestament/actions/runs/45495151129)
  succeeded. Public npm `latest` resolves to `0.7.0`; `preview` remains `0.6.0-preview.4`.
- A fresh registry install through the proposed plugin defaults produced a usable
  nine-score JS/TS report, validated .NET 2.4.3 and Python 0.15.0, and passed a
  relocated-worktree baseline comparison. Audit: `5484972e-a470-4733-8c00-da926420812b`.
- The separate Python registry fixture passed, retaining exactly two scores,
  Async/Blocking Usage 8 and unscored Error Handling. Its first attempt preceded
  registry propagation and returned ETARGET; a new download cache passed once
  0.7.0 became available. No analyzer changes were needed.
- Registry artifact integrity:
  `sha512-cZrkIodCVvmyKKzyWNNzpGNt0NtKdcJ6aG0gfmkBvouxxTTzguhNL/z3ng89fwa1LkRiOi+/p1dMGgvHG7rX9Q==`.

Receipts: `TestResults/published-070/verified.json`,
`TestResults/published-python-070-final/package-provenance.json` and
`published-python-070-final.log`. Plugin 0.4.0 promotes these verified defaults;
the analyzer artifact itself does not change during that promotion.
