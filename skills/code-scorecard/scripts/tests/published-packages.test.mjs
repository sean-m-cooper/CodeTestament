import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compatibility } from '../run-scorecard.mjs';

// Explicit release verification; this downloads real registry packages.
const destination = process.env.SCORECARD_PUBLISHED_OUTPUT;
test('published defaults install into empty caches and validate all three ecosystems', {
  skip: !destination, timeout: 300_000,
}, () => {
  assert.deepEqual(compatibility.defaults, {
    'javascript-typescript': 'codetestament@0.5.2', npm: 'codetestament@0.6.0-preview.4', dotnet: 'CodeTestament.Scorecard@2.4.2',
  });
  const output = path.resolve(destination);
  assert.ok(!fs.existsSync(output), 'Release verification requires a new output directory.');
  const root = path.join(output, 'repo'), cache = path.join(output, 'cache');
  const write = (relative, value) => {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  write('app/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>');
  write('app/Work.cs', 'public class Work { public int Run(int value) => value > 0 ? value : 0; }');
  write('app/Identifiers.cs', `public class Identifiers {
    private const string PaymentCardTokenRecordType = "paymentcardtoken";
    public string Settings() {
      // codemetrics-ignore: CMAI4001 -- AWS secret identifier; credential retrieved at runtime.
      const string secret = "FortisPayment.Settings";
      return secret;
    }
    private const string ApiKey = "syntheticCredentialValue1234";
  }`);
  write('ui/package.json', '{"name":"registry-fixture","private":true}');
  write('ui/tsconfig.json', '{"compilerOptions":{"baseUrl":".","rootDir":"."}}');
  write('ui/work.ts', 'export function choose(value: number) { return value > 0 ? value : 0; }');
  write('python/pyproject.toml', '[project]\nname="registry-fixture"\nversion="0.0.0"\n');
  write('python/work.py', 'import time\nasync def work():\n    time.sleep(1)\n');
  const env = { ...process.env, NUGET_PACKAGES: path.join(output, 'restore-packages'),
    NUGET_HTTP_CACHE_PATH: path.join(output, 'restore-http'), npm_config_cache: path.join(output, 'npm-download-cache') };
  // Restrict this rehearsal's NuGet resolution to the public registry.
  fs.writeFileSync(path.join(output, 'NuGet.config'), '<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>');
  const invoke = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 240_000 });
    assert.ifError(result.error);
    return result;
  };
  // Isolate fixture roots from the enclosing checkout used to run this test.
  const initialized = invoke('git', ['init', root]);
  assert.equal(initialized.status, 0, initialized.stdout + initialized.stderr);
  const restored = invoke('dotnet', ['restore', 'app/App.csproj']);
  assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  const runner = fileURLToPath(new URL('../run-scorecard.mjs', import.meta.url));
  const child = invoke(process.execPath, [runner, '--repo', root, '--cache', cache, '--skip-dependency-probe']);
  fs.writeFileSync(path.join(output, 'helper.stdout.json'), child.stdout ?? '');
  fs.writeFileSync(path.join(output, 'helper.stderr.log'), child.stderr ?? '');
  assert.equal(child.status, 0, child.stderr + child.stdout);
  const result = JSON.parse(child.stdout);
  assert.equal(result.results.length, 3);
  assert.equal(new Set(result.results.map(run => run.runId)).size, 3);
  const expected = { dotnet: ['CodeTestament.Scorecard', '2.4.2'],
    'javascript-typescript': ['CodeTestament.JavaScript', '0.5.2'], python: ['CodeTestament.Python', '0.15.0'] };
  for (const run of result.results) {
    assert.equal(run.status, 'complete'); assert.equal(run.fresh, true);
    assert.equal(run.source, 'compatibility-manifest');
    assert.equal(run.analyzerExitCode, 0); assert.equal(run.validationExitCode, 0);
    const inspection = JSON.parse(fs.readFileSync(run.artifacts.inspection, 'utf8'));
    const evidence = inspection.evidence;
    assert.equal(inspection.usable, true);
    assert.deepEqual([evidence.tool.name, evidence.tool.version], expected[run.ecosystem]);
    assert.equal(evidence.analysis.runId, run.runId); assert.equal(evidence.analysis.auditId, result.auditId);
    assert.equal(run.tooling.analyzer.archiveSha256, null);
    assert.equal(path.basename(run.tooling.analyzer.cache), 'registry');
    if (run.ecosystem === 'dotnet') {
      assert.equal(run.ruleCatalog.status, 'available');
      const catalog = JSON.parse(fs.readFileSync(run.artifacts.ruleCatalog, 'utf8'));
      assert.equal(catalog.tool.name, 'CodeTestament.Scorecard'); assert.equal(catalog.tool.version, '2.4.2');
      assert.ok(catalog.rules.some(rule => rule.code === 'CMAI5001'));
      const secretRule = catalog.rules.find(rule => rule.code === 'CMAI4001');
      assert.equal(secretRule.annotation.supported, true);
      assert.equal(secretRule.annotation.rationaleRequired, true);
      const secrets = evidence.dimensions.security.findings.filter(finding => finding.category === 'hardcodedSecret');
      assert.equal(secrets.length, 1, 'Only the synthetic credential control should remain.');
      assert.match(secrets[0].message, /ApiKey/);
    } else {
      const installed = JSON.parse(fs.readFileSync(path.join(run.tooling.analyzer.cache, 'node_modules/codetestament/package.json'), 'utf8'));
      assert.equal(installed.name, 'codetestament'); assert.equal(installed.version, run.ecosystem === 'python' ? '0.6.0-preview.4' : '0.5.2');
      const lock = JSON.parse(fs.readFileSync(path.join(run.tooling.analyzer.cache, 'package-lock.json'), 'utf8'));
      const provenance = lock.packages['node_modules/codetestament'];
      assert.match(provenance.resolved, /^https:\/\/registry\.npmjs\.org\/codetestament\/-\//);
      assert.match(provenance.integrity, /^sha512-/);
      if (run.ecosystem === 'python') {
        assert.equal(evidence.dimensions.errorHandling.status, 'skipped');
        assert.equal(evidence.dimensions.errorHandling.score, undefined);
        assert.ok(Object.values(evidence.dimensions).filter(value => value.status === 'scored').length <= 2);
      }
    }
  }
  const baseline = result.results.find(run => run.ecosystem === 'javascript-typescript');
  const relocated = path.join(output, 'other-worktree'); fs.mkdirSync(path.join(relocated, 'ui'), { recursive: true });
  for (const file of ['package.json', 'tsconfig.json', 'work.ts'])
    fs.copyFileSync(path.join(root, 'ui', file), path.join(relocated, 'ui', file));
  const relocatedRepository = invoke('git', ['init', relocated]);
  assert.equal(relocatedRepository.status, 0, relocatedRepository.stdout + relocatedRepository.stderr);
  const moved = invoke(process.execPath, [runner, '--repo', relocated, '--entry-point', 'ui/package.json', '--cache', cache,
    '--baseline', baseline.artifacts.evidence, '--fail-on-new', 'warning', '--max-score-drop', '0']);
  assert.equal(moved.status, 0, moved.stderr + moved.stdout);
  const movedRun = JSON.parse(moved.stdout).results[0];
  const comparison = JSON.parse(fs.readFileSync(movedRun.artifacts.comparison, 'utf8'));
  assert.equal(comparison.compatible, true);
  assert.equal(movedRun.comparisonExitCode, 0);
  fs.writeFileSync(path.join(output, 'portable-baseline.json'), moved.stdout);
  fs.writeFileSync(path.join(output, 'verified.json'), JSON.stringify({
    defaults: compatibility.defaults, source: compatibility.source,
    auditId: result.auditId, runs: result.results, status: 'passed',
  }, null, 2) + '\n');
});
