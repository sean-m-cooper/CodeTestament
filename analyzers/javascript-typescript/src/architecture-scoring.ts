import type { Dimension } from './evidence.js';
import type { ModuleGraphCollector } from './module-graph.js';
import type { decompositionModule } from './decomposition-evidence.js';
import type { DependencyObservation } from './module-graph.js';
import { observationFinding, policyDimension } from './dimension-policy.js';
import { add, decimal, fraction, roundScore, subtract } from './score-arithmetic.js';

export function scoreArchitecture(dimension: ReturnType<ModuleGraphCollector['finish']>, modules: ReturnType<typeof decompositionModule>[]): Dimension {
  if (dimension.status === 'failed') return dimension;
  const graph = dimension.dependencyGraph as { dependencies: DependencyObservation[] };
  const owners = modules.filter(m => m.functions.length || m.initializer.ownedStatements > 0);
  if (!owners.length) return { ...dimension, basis: 'No implementation modules; coupling is unmeasured.' };
  const rows = owners.map(m => {
    const references = graph.dependencies.filter(d => d.from === m.file && d.usage !== 'typeOnly' && d.roles.includes('implementation'));
    const targets = [...new Set(references.filter(d => d.specifier !== null).map(d => d.target ?? d.targetFile ?? d.specifier!))].sort();
    return { file: m.file, project: m.project, targets, fanOut: targets.length, dynamicReferences: references.filter(d => d.specifier === null).length };
  });
  const hotspots = rows.filter(row => row.fanOut > 10), worst = Math.max(...rows.map(row => row.fanOut));
  const ratePenalty = fraction(BigInt(Math.min(6 * rows.length, 12 * hotspots.length)), BigInt(rows.length));
  const severityPenalty = fraction(BigInt(Math.min(40, 2 * Math.max(0, worst - 10))), 10n);
  const score = roundScore(subtract(decimal(10), add(ratePenalty, severityPenalty)));
  const findings = [...dimension.findings, ...hotspots.map(row => observationFinding('architecture', 'moduleCouplingHotspot', row.file,
    `${row.fanOut} distinct implementation dependency targets exceed the review threshold of 10.`, row, { fanOut: row.fanOut, threshold: 10, targets: row.targets }))];
  const result = policyDimension('architecture', 'implementation-coupling-v1', score,
    'Partial Architecture: implementation dependency concentration. Coupling is a review signal, not proof of an SRP defect. Re-export surfaces and cycles add no deduction.',
    { eligibleModules: rows.length, hotspotModules: hotspots.length, worstFanOut: worst, threshold: 10, modules: rows,
      formula: '10 - min(6, 12*hotspots/eligible) - min(4, 2*max(0,worstFanOut/10-1))' }, findings,
    ['distinct-literal-implementation-targets', 'external-and-internal-targets', 'population-and-severity'],
    ['type-only-references', 're-export-only-modules', 'cycle-penalties', 'dynamic-target-inference', 'SOLID-compliance']);
  return { ...dimension, ...result };
}
