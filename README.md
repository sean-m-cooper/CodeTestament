# CodeTestament

CodeTestament is a suite of deterministic code analyzers that produce shared scorecard evidence for AI-assisted codebase review.

Its goal is to guide human and AI developers toward better, more maintainable and performant code. Scores express documented product expectations and identify opportunities for improvement; they do not prove defects or replace engineering judgment. The [complexity scoring policy](shared/scorecard-schema/calibration.md#complexity-scoring-product-decision) records the accepted method-CC bands and the distinction between product decisions and their scoring implementation. Real-world usage and developer feedback should inform explicit, versioned policy revisions.

## Run your first scorecard

Open Claude Code in the repository you want to assess. The scorecard skill needs Node.js 20+ and npm. For .NET projects, install the .NET 10 SDK. For Python projects, install Python 3.12.

Enter each line separately in Claude Code.

```text
/plugin marketplace add sean-m-cooper/ai_tools
/plugin install codetestament@ai-tools
/reload-plugins
/codetestament:code-scorecard Run the scorecard against this repo.
```

The report shows which dimensions were assessed and the evidence behind their scores. Each fresh run writes its evidence and inspection under `.scorecard/<ecosystem>/runs/<runId>/`. For Codex and other hosts, see the [skill installation guide](docs/scorecard-skill.md#install-or-test).

## Analyzer outputs

The .NET and JS/TS command-line analyzers write these files by default. Python preview emits JSON evidence only.

| File | Description |
|------|-------------|
| `.scorecard/<ecosystem>/metrics.csv` | Raw code metrics in the shared CSV shape |
| `.scorecard/<ecosystem>/evidence.json` | Scored evidence across stable quality dimensions |

> **CodeTestament packages are published.** NuGet `CodeTestament.Scorecard@2.4.0`
> is the .NET default. JS/TS uses `codetestament@0.5.1` and Python uses `codetestament@0.6.0-preview.3`. See the
> [migration guide](docs/codetestament-migration.md) for installation and baseline compatibility.

## Agent skill

The canonical [code-scorecard skill](skills/code-scorecard/SKILL.md) lives in this
repository with its helpers, compatibility manifest, tests and evaluation fixtures.
The `codetestament` plugin packages it for agent hosts; `ai_tools` references a
pinned commit instead of maintaining another copy.

See [skill installation and maintenance](docs/scorecard-skill.md) and the
[scorecard guide](docs/code-scorecard.md). The skill retains its CC BY 4.0 license;
analyzer code remains MIT. Exact repository pins to supported legacy packages
remain honored; unpinned runs use the verified CodeTestament packages.

## Analyzers

| Ecosystem | Location | Package | Status |
|-----------|----------|---------|--------|
| .NET / C# | `analyzers/dotnet` | `CodeTestament.Scorecard@2.4.0` NuGet global tool | Available |
| JavaScript / TypeScript / React | `analyzers/javascript-typescript` | `codetestament@0.5.1` npm package | Implemented; scores uncalibrated |
| Python | `analyzers/python` | `codetestament-python` in `codetestament@0.6.0-preview.3`; Python 3.12 required | Preview: Method Complexity and Async/Blocking Usage scoring; other evidence unscored |
| Rust | `analyzers/rust` | Rust crate | Planned next wave |

## Shared Contract

The shared scorecard contract is documented in `shared/scorecard-schema`.

The experimental [language adapter contract](shared/source-facts/README.md) separates parser facts from shared scoring mechanics. The [Python adapter](analyzers/python/README.md) now embeds those facts in evidence v3 through the preview npm CLI. It scores Method Complexity and, when eligible production async functions exist, Async/Blocking Usage. Error Handling and the other six dimensions remain unscored. It produces no CSV. Any aggregate is explicitly a partial assessment with at most 2/9 dimensions scored.

Stable dimensions:

- `codeQuality`
- `maintainability`
- `errorHandling`
- `performanceAsync` — displayed as **Async/Blocking Usage**
- `security`
- `testing`
- `documentation`
- `dependencyManagement`
- `architecture`

## .NET Usage

Install the **.NET 10 SDK** and check that `dotnet --version` selects 10.x in your project directory. Then install the tool and pass your solution or project path.

```bash
dotnet tool install -g CodeTestament.Scorecard --version 2.4.0
codetestament-dotnet --solution YourProject.csproj --configuration Release
```

See the [.NET analyzer README](analyzers/dotnet/README.md) for installation, usage, options, filtering, and code-annotation details.

### .NET code annotations

The .NET analyzer recognizes several annotations that affect analysis:

- `// amp-metrics: sync-required` marks an intentionally synchronous method.
- `[FromServices]` prevents action-injected dependencies from inflating class coupling.
- `[Authorize]` and `[AllowAnonymous]` inform security findings.
- Common xUnit, NUnit, and MSTest attributes identify test methods and skipped tests.

See [Code annotations and recognized attributes](analyzers/dotnet/README.md#code-annotations-and-recognized-attributes)
for exact placement, supported spellings, and scoring effects.

## JavaScript / TypeScript Usage

```bash
npm exec --yes --package=codetestament@0.5.1 -- codetestament
```

The JS/TS analyzer implements source metrics, function-based complexity and maintainability, React hook/effect checks and bounded standard-Promise/Array callback checks. Its module dependency graph reports resolution coverage, type-only references, cycles and fan-in/out as unscored architecture evidence. Decomposition reports owned executable statements, and error-handling evidence resolves selected-source callback bodies without double-counting reuse. Architecture and decomposition remain unscored; the other unsupported dimensions remain unavailable. See its [README](analyzers/javascript-typescript/README.md) for scope and scoring policy, and the [0.4.0 release notes](docs/releases/javascript-typescript-0.4.0.md) for migration requirements.

Legacy version 0.5.0 introduced [contextual Error Handling scoring](shared/scorecard-schema/javascript-typescript-error-handling-policy.md).
It honors documented intent and scores unexplained swallowing only when all
observed handlers are assessable; unknown paths withhold the dimension score.
Architecture and decomposition remain unscored.

## Python preview

Requires Node.js 20+ and Python 3.12. Install the exact preview without changing your project dependencies:

```sh
npm exec --yes --package=codetestament@0.6.0-preview.3 -- codetestament-python --project ./pyproject.toml --scorecard-output ./python-evidence.json
npm exec --yes --package=codetestament@0.6.0-preview.3 -- codetestament-evidence --input ./python-evidence.json --inspect-output ./python-inspection.json
```

Use new output filenames for each run. Python ships in the exact preview package above. The stable JS/TS package is `codetestament@0.5.1`. See the [preview release notes](docs/releases/codetestament-2026-10-30.md) and [Python guide](analyzers/python/README.md) for source selection, score limits, and feedback guidance.

## Evidence and release verification

Analyzers now emit schema v3; see the [migration guide](shared/scorecard-schema/migration-v3.md). Use the shared [evidence CLI](docs/evidence-workflows.md) for baseline comparisons, optional CI gates, and SARIF export. The [pinned regression corpus](shared/calibration/README.md) checks accuracy labels and score distributions on every CI run.

## License

[MIT](LICENSE)
