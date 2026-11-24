import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyze } from '../src/analyzer.js';
import { validateEvidence, compare } from '../dist/evidence-tools.js';
import { errorHandlingDecision } from '../src/error-handling-scoring.js';
import { dependencyEvidence } from '../src/dependency-evidence.js';
import type { DependencyInventory } from '../src/dependency-inventory.js';
import { noMetadata, type DependencyMetadata } from '../src/dependency-metadata.js';

const roots: string[] = [];
function fixture(files: Record<string,string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'full-dimensions-')); roots.push(root);
  for (const [file, value] of Object.entries({ 'package.json': '{"name":"signals"}',
    'src/main.ts': 'export async function work() { try { return await Promise.resolve(1); } catch (e) { throw e; } }', ...files })) {
    const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value);
  }
  return root;
}
function run(files: Record<string,string> = {}) {
  const result = analyze({ project: path.join(fixture(files), 'package.json') }, '0.7.0');
  validateEvidence(result.evidence); return result;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('nine-dimension scorecard', () => {
  it('emits nine actual decisions with supported evidence and scores both C&D components', () => {
    const result = run({
      'README.md': '# Signals\nA small asynchronous demonstration library.\n## Usage\nCall work().\n## Testing\nRun node --test.',
      'test/main.test.js': "import {test} from 'node:test'; import assert from 'node:assert/strict'; test('works', () => { assert.equal(1, 1); });",
      'package-lock.json': '{"lockfileVersion":3,"packages":{"":{"name":"signals"}}}'
    });
    const dimensions = Object.values(result.evidence.dimensions);
    expect(dimensions).toHaveLength(9);
    for (const dimension of dimensions) {
      expect(dimension.status).toBe('scored'); expect(dimension.score).toBe(10);
      expect(dimension.scoringDecision?.finalScore).toBe(dimension.score);
      expect(dimension.scope?.coverage).toBe('partial');
    }
    const components = result.evidence.dimensions.codeQuality.componentDetails as any;
    expect(components.methodComplexity.score).toBe(10); expect(components.decomposition.score).toBe(10);
    expect(result.inputs.some(file => file.endsWith('README.md'))).toBe(true);
    expect(result.inputs.some(file => file.endsWith('main.test.js'))).toBe(true);
    const old = structuredClone(result.evidence); old.analysis.ruleset = 'javascript-typescript-2026-10-09-dependency-evidence';
    expect(() => compare(result.evidence, old)).toThrow('ruleset');
  });
  it('keeps no evidence distinct from clean evidence', () => {
    const d = run({ 'src/main.ts': 'export function work() { return 1; }' }).evidence.dimensions;
    expect(d.testing.score).toBe(0); expect(d.documentation.score).toBe(0);
    expect(d.errorHandling.status).toBe('skipped'); expect(d.performanceAsync.status).toBe('skipped');
    expect(d.security.score).toBe(10);
    const unknown = run({ 'tests/main.test.js': "customFramework('case', () => {});" }).evidence.dimensions.testing;
    expect(unknown.status).toBe('skipped'); expect(unknown.score).toBeUndefined();
  });
  it('invalidates new source-derived scores when production parsing fails', () => {
    const e = run({ 'src/main.ts': 'export function {' }).evidence;
    for (const key of ['architecture', 'codeQuality', 'testing', 'security', 'documentation', 'errorHandling', 'performanceAsync', 'maintainability'] as const)
      expect(e.dimensions[key].score).toBeUndefined();
    expect(e.analysis.status).toBe('incomplete');
  });
});
describe('bounded production signals', () => {
  it('recognizes imported shell aliases and global eval, excluding safe APIs and shadows', () => {
    const e = run({ 'src/main.ts': `import {exec as shell, execFile} from 'node:child_process';
      export function risk(input: string) { shell(input); eval(input); }
      export function safe(input: string, eval: Function, exec: Function) { eval(input); exec(input); execFile('echo', [input]); }
      const custom = {exec: (x: string) => x}; custom.exec('x');` }).evidence;
    expect(e.dimensions.security.score).toBe(6);
    expect(e.dimensions.security.findings.map(f => f.category).sort()).toEqual(['dynamicCodeExecution', 'dynamicShellCommand']);
  });
  it('never flags credential-looking configuration identifiers and redacts private-key evidence', () => {
    const text = '-----BEGIN PRIVATE KEY-----\nSYNTHETIC-KEY-MATERIAL\n-----END PRIVATE KEY-----';
    const safe = run({ 'src/main.ts': `export const secret = 'FortisPayment.Settings'; export const PaymentCardTokenRecordType='paymentcardtoken';` });
    expect(safe.evidence.dimensions.security.score).toBe(10);
    const e = run({ 'src/main.ts': `export const key = ${JSON.stringify(text)};` }).evidence;
    expect(e.dimensions.security.score).toBe(2);
    expect(JSON.stringify(e)).not.toContain('SYNTHETIC-KEY-MATERIAL');
  });
  it('recognizes shell:true hazards but permits static commands and argument-array execution', () => {
    const e = run({ 'src/main.ts': `const {spawn, exec} = require('node:child_process');
      const command='git status'; exec(command); exec('git '+'status');
      export function work(input: string){spawn('echo',[input]); spawn('echo',[input],{shell:true});}` }).evidence;
    expect(e.dimensions.security.findings).toHaveLength(1);
    expect(e.dimensions.security.findings[0].category).toBe('dynamicShellCommand');
  });
  it('scores owned statements rather than physical lines, excluding nested bodies from parents', () => {
    const statements = Array.from({length: 50}, (_, i) => `sink(${i});`);
    const one = run({ 'src/main.ts': `export function work(){${statements.join('')} }` }).evidence.dimensions.codeQuality;
    const many = run({ 'src/main.ts': `export function work(){\n${statements.join('\n')}\n}` }).evidence.dimensions.codeQuality;
    expect(one.score).toBe(many.score);
    expect((one.componentDetails as any).decomposition.score).toBe(5.5);
    expect(one.score).toBe(7.8);
    const nested = run({ 'src/main.ts': `export function work(){ function inner(){${statements.join('')}} return inner; }` }).evidence.dimensions.codeQuality;
    const rows = (nested.componentDetails as any).decomposition.modules[0].functions;
    expect(rows.map((r:any) => r.ownedStatements).sort((a:number,b:number) => a-b)).toEqual([1,50]);
  });
  it('scores implementation concentration without penalizing barrel surfaces or cycles', () => {
    const files: Record<string,string> = {};
    for (let n=0;n<11;n++) files[`src/m${n}.ts`] = `export const v${n}=()=>${n};`;
    const imports = Array.from({length:11}, (_,n) => `import {v${n}} from './m${n}';`).join('\n');
    files['src/main.ts'] = imports + `export function work(){return [${Array.from({length:11},(_,n)=>`v${n}()`).join(',')}];}`;
    const d = run(files).evidence.dimensions.architecture;
    expect(d.score).toBe(8.8); expect(d.findings.filter(f => f.category==='moduleCouplingHotspot')).toHaveLength(1);
    files['src/main.ts'] = Array.from({length:11},(_,n)=>`export {v${n}} from './m${n}';`).join('\n');
    expect(run(files).evidence.dimensions.architecture.score).toBe(10);
  });
  it('scores assessed handlers without assigning unknown bodies credit or blame', () => {
    expect(errorHandlingDecision(102,2,2,7)?.finalScore).toBe(9);
    expect(errorHandlingDecision(2,0,2,0)).toBeUndefined();
    const d = run({ 'src/main.ts': 'export function f(){ try { go(); } catch(e){ throw e; } try { go(); } catch(e){ custom(e); } }' }).evidence.dimensions.errorHandling;
    expect(d.score).toBe(10); expect((d.dispositionEvidence as any).assessedHandlers).toBe(1);
    expect((d.dispositionEvidence as any).unknownHandlers).toBe(1);
    expect(d.scoringDecision?.findingEffects.every(f => f.effect==='excluded')).toBe(true);
  });
});
describe('test and dependency evidence boundaries', () => {
  it('counts nested skipped suites, placeholders and aliases, without counting shadowed declarations', () => {
    const d = run({ 'test/main.test.ts': `import { test as check, describe } from 'node:test'; import {strictEqual as same} from 'node:assert';
      check('active',()=>{same(1,1)}); describe.skip('group',()=>{check('skipped',()=>{same(1,1)})});
      check.todo('later'); function fake(check: Function){check('not a test',()=>{})}` }).evidence.dimensions.testing;
    expect((d.testEvidence as any).recognizedTests).toBe(3);
    expect((d.testEvidence as any).activeTests).toBe(1); expect(d.score).toBe(3.3);
  });
  it('discovers tests excluded from production tsconfig and never includes their complexity', () => {
    const result = run({ 'tsconfig.json': '{"include":["src/**/*.ts"]}',
      'test/unit.test.ts': "import {test,expect} from 'vitest'; test('case',()=>{expect(1).toBe(1)});" });
    expect(result.evidence.dimensions.testing.score).toBe(10); expect(result.metrics).toHaveLength(1);
  });
  it('recognizes unmodified CommonJS assert and Supertest chains, excluding rewritten bindings', () => {
    const d = run({ 'test/main.test.js': `var test = require('node:test'); var assert=require('node:assert'); var request=require('supertest');
      test('unit',()=>{assert.strictEqual(1,1)}); test('HTTP',()=>{request(app).get('/').expect(200)});
      var replaced=require('node:assert'); replaced=custom;
      test('unknown',()=>{replaced.strictEqual(1,1)});` }).evidence.dimensions.testing;
    expect((d.testEvidence as any).assertionBearingTests).toBe(2); expect(d.score).toBe(9.3);
  });
  it('preserves inactive-test identities across line movement and discloses parameterized declarations', () => {
    const code = "import {test,expect} from 'vitest'; test.skip('later',()=>{}); test.each([1,2])('case', n=>{expect(n).toBe(n)});";
    const before = run({'test/unit.test.ts':code}).evidence;
    const after = run({'test/unit.test.ts':'\n\n'+code}).evidence;
    expect(before.dimensions.testing.findings[0].fingerprint).toBe(after.dimensions.testing.findings[0].fingerprint);
    expect((before.dimensions.testing.testEvidence as any).unresolvedTests).toBe(1);
  });
  it('does not manufacture package health from missing lockfiles, unsupported managers or failed requests', () => {
    for (const manifest of ['{"dependencies":{"private-package":"1"}}', '{"packageManager":"yarn@4.0.0"}']) {
      const d=run({'package.json':manifest}).evidence.dimensions.dependencyManagement;
      expect(d.status).toBe('skipped'); expect(d.score).toBeUndefined();
    }
    const inventory: DependencyInventory = {version:1,status:'complete',countingUnit:'packageNameVersionSource',packages:[{id:'a',name:'a',version:'1.0.0',source:'publicRegistry',locations:[],uses:[]}],gaps:[],notices:[],manifests:[],lockfiles:[]};
    const offline=dependencyEvidence(inventory); expect(offline.score).toBeUndefined();
    const unavailable: DependencyMetadata={...noMetadata(),status:'unavailable',unavailablePackages:1};
    expect(dependencyEvidence(inventory,unavailable,'public-registry').score).toBeUndefined();
    const metadata: DependencyMetadata={...noMetadata(),status:'available',availablePackages:1,observations:[{packageId:'a',name:'a',version:'1.0.0',metadata:{status:'available'},vulnerabilities:{status:'available',advisories:[{id:'1',title:'unsafe',severity:'high',url:'https://example.org/1',range:'<2'}]}}]};
    expect(dependencyEvidence(inventory,metadata).score).toBe(2);
  });
});
