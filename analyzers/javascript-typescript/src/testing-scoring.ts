import fs from 'node:fs';
import ts from 'typescript';
import { isFunction } from './function-nodes.js';
import { importedApi, globalName, unwrap } from './source-bindings.js';
import { ownedProjectFiles, relativeFile } from './project-signals.js';
import type { PackageInput } from './discovery.js';
import { observationFinding, policyDimension } from './dimension-policy.js';
import { fraction, roundScore } from './score-arithmetic.js';
import { hash, type Dimension } from './evidence.js';

interface TestSignal { file: string; line: number; project: string; id: string; status: 'active' | 'skipped' | 'placeholder' | 'unresolved'; assertions: number; }
const frameworks = new Set(['vitest', '@jest/globals', 'test', 'mocha']);
function callName(expression: ts.Expression, checker: ts.TypeChecker, globals: boolean): { module: string; name: string } | undefined {
  const api = importedApi(expression, checker);
  if (api) return api;
  let node = unwrap(expression), suffix = '';
  while (ts.isPropertyAccessExpression(node)) { suffix = '.' + node.name.text + suffix; node = unwrap(node.expression); }
  if (globals && ts.isIdentifier(node) && ['test', 'it', 'describe', 'expect', 'xit', 'xtest', 'xdescribe'].includes(node.text) && globalName(node, checker))
    return { module: 'test-globals', name: node.text + suffix };
}
function assertionCall(call: ts.CallExpression, checker: ts.TypeChecker, globals: boolean): boolean {
  const api = callName(call.expression, checker, globals);
  if (api && ['assert', 'assert/strict'].includes(api.module) && ['*','default','ok','equal','notEqual','strictEqual','notStrictEqual','deepEqual','notDeepEqual','deepStrictEqual','notDeepStrictEqual','throws','doesNotThrow','rejects','doesNotReject','ifError','fail','match','doesNotMatch'].includes(api.name)) return true;
  // Fluent HTTP expectations stay tied to the imported Supertest factory.
  if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'expect') {
    let root = unwrap(call.expression.expression);
    while (ts.isCallExpression(root) && ts.isPropertyAccessExpression(root.expression)) root = unwrap(root.expression.expression);
    if (ts.isCallExpression(root) && importedApi(root.expression, checker)?.module === 'supertest') return true;
  }
  // expect(value).matcher(), including resolves/rejects; count the matcher once.
  let expression = unwrap(call.expression);
  while (ts.isPropertyAccessExpression(expression)) expression = unwrap(expression.expression);
  if (!ts.isCallExpression(expression)) return false;
  const expect = callName(expression.expression, checker, globals);
  return !!expect && (frameworks.has(expect.module) || expect.module === 'test-globals') && expect.name === 'expect';
}
function inspect(source: ts.SourceFile, checker: ts.TypeChecker, globals: boolean, file: string, project: string): TestSignal[] {
  const rows: TestSignal[] = [];
  const identities = new Map<string, number>();
  function visit(node: ts.Node, skipped = false) {
    if (ts.isCallExpression(node)) {
      const api = callName(node.expression, checker, globals);
      if (api && (frameworks.has(api.module) || api.module === 'test-globals')) {
        const parts = api.name.split('.'), base = ['default', '*'].includes(parts[0]) && api.module === 'test' ? 'test' : parts[0];
        const disabled = skipped || parts.includes('skip') || ['xit', 'xtest', 'xdescribe'].includes(base);
        if (['describe', 'suite', 'xdescribe'].includes(base)) { ts.forEachChild(node, child => visit(child, disabled)); return; }
        if (['test', 'it', 'xit', 'xtest'].includes(base)) {
          const supported = parts.every(p => ['*','default','test','it','xit','xtest','skip','todo','only','concurrent','sequential'].includes(p));
          const callback = node.arguments.find(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
          const options = node.arguments.find(ts.isObjectLiteralExpression);
          const option = (key: string) => options?.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(source) === key && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
          let assertions = 0;
          if (callback && isFunction(callback) && callback.body) {
            function count(current: ts.Node) {
              if (current !== callback && isFunction(current)) return;
              if (ts.isCallExpression(current) && assertionCall(current, checker, globals)) assertions++;
              ts.forEachChild(current, count);
            }
            count(callback);
          }
          const empty = callback && isFunction(callback) && callback.body && ts.isBlock(callback.body) && !callback.body.statements.length;
          const identity = `${file}|${node.getText(source)}`, occurrence = identities.get(identity) ?? 0;
          identities.set(identity, occurrence + 1);
          rows.push({ file, project, id: hash(`${identity}|${occurrence}`), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            status: !supported ? 'unresolved' : disabled || option('skip') ? 'skipped' : parts.includes('todo') || option('todo') || empty || node.arguments.length === 1 ? 'placeholder' : callback ? 'active' : 'unresolved', assertions });
        }
      }
    }
    ts.forEachChild(node, child => visit(child, skipped));
  }
  visit(source); return rows;
}
export function scoreTesting(packages: PackageInput[], root: string): { dimension: Dimension; inputs: string[] } {
  const rows: TestSignal[] = [], inputs: string[] = [], diagnostics: { file: string; reason: string }[] = [];
  for (const { pkg, files } of ownedProjectFiles(packages)) {
    const tests = files.filter(f => /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|[/\\](?:__tests__|tests?)[/\\].*\.[cm]?[jt]sx?$)/.test(f) &&
      !/[/\\]fixtures[/\\]|\.(?:generated|g|min)\.|\.d\.[cm]?ts$/.test(f));
    inputs.push(...tests);
    const manifest = JSON.parse(fs.readFileSync(pkg.entryPoint, 'utf8'));
    const declared = { ...manifest.dependencies, ...manifest.devDependencies };
    const globals = ['jest', 'vitest', 'mocha'].some(name => Object.hasOwn(declared, name));
    const program = ts.createProgram(tests, { ...pkg.options, allowJs: true, noEmit: true });
    const checker = program.getTypeChecker();
    for (const file of tests) {
      const source = program.getSourceFile(file), relative = relativeFile(root, file);
      if (!source || program.getSyntacticDiagnostics(source).length) { diagnostics.push({ file: relative, reason: 'Test source could not be parsed' }); continue; }
      if (/^\s*(?:\/\/|\/\*)[^\n]*(?:@generated|<auto-generated)/im.test(source.text)) continue;
      const observed = inspect(source, checker, globals, relative, pkg.name);
      rows.push(...observed);
      if (!observed.length) diagnostics.push({ file: relative, reason: 'No supported test declarations recognized; may be a helper or a different framework' });
    }
  }
  const active = rows.filter(r => r.status === 'active'), assessed = rows.filter(r => r.status !== 'unresolved');
  const assertions = active.filter(r => r.assertions > 0).length;
  const observations = { discoveredTestFiles: inputs.length, recognizedTests: rows.length, assessedTests: assessed.length,
    activeTests: active.length, assertionBearingTests: assertions, unresolvedTests: rows.length - assessed.length,
    skippedTests: rows.filter(r => r.status === 'skipped').length, placeholderTests: rows.filter(r => r.status === 'placeholder').length,
    tests: rows, diagnostics, execution: 'notPerformed', coverage: 'notMeasured', formula: '(8*active + 2*assertionBearing) / assessed' };
  const findings = rows.filter(r => r.status === 'skipped' || r.status === 'placeholder').map(r => observationFinding('testing', 'inactiveTest', r.id,
    `Recognized ${r.status} test; it does not provide an active test signal.`, r, { status: r.status }));
  const dimension = policyDimension('testing', 'static-test-signals-v1', assessed.length ? roundScore(fraction(BigInt(8 * active.length + 2 * assertions), BigInt(assessed.length))) : 0,
    'Partial Testing: active declarations and direct assertion signals in recognized test files. Helpers may contain unrecognized assertions. Test execution, passing results and coverage are not established.',
    observations, findings, ['node-test', 'jest-vitest-mocha-declarations', 'direct-expect-and-node-assert', 'inactive-test-rate'],
    ['test-execution', 'coverage', 'mutation-testing', 'custom-frameworks', 'helper-assertion-flow', 'parameterized-test-expansion']);
  if (!assessed.length && inputs.length) return { inputs, dimension: { ...dimension, status: 'skipped', score: undefined, scoringDecision: undefined,
    scoring: undefined, basis: 'Test files exist, but no supported test population is assessable; no score is inferred.', testEvidence: observations } };
  return { dimension: { ...dimension, testEvidence: observations }, inputs };
}
