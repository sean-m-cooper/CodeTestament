import type { Dimension } from './evidence.js';
import type { decompositionEvidence } from './decomposition-evidence.js';
import { aggregatePopulation } from '#source-facts/population.mjs';
import { observationFinding, policyDimension } from './dimension-policy.js';
import { decimal, add, multiply, fraction, roundScore } from './score-arithmetic.js';

export const decompositionAnchors = [[10, 10], [20, 8], [40, 6], [80, 4], [160, 0]] as const;
export function scoreDecomposition(complexity: Dimension, evidence: ReturnType<typeof decompositionEvidence>): Dimension {
  const rows = evidence.modules.flatMap(m => m.functions.map(f => ({ ...f, file: m.file, project: m.project })));
  if (complexity.status !== 'scored' || !rows.length || evidence.status === 'failed')
    return { ...complexity, componentDetails: { ...(complexity.componentDetails as object), decomposition: evidence } };
  const population = aggregatePopulation(rows.map(row => ({ id: row.id, value: row.ownedStatements })), decompositionAnchors, true, Math.ceil(rows.length / 5))!;
  const findings = rows.filter(r => r.ownedStatements > 40).map(row => observationFinding('codeQuality', 'largeFunctionBody', row.id,
    `${row.ownedStatements} owned executable statements; review decomposition without assuming distinct responsibilities.`, row,
    { functionId: row.id, ownedStatements: row.ownedStatements }));
  const decomposition = policyDimension('codeQuality', 'owned-statements-v1', population.score,
    'Owned executable statements: weakest quintile receives 40%, remainder 60%; formatting and nested bodies do not inflate size.',
    { anchors: decompositionAnchors, ...population, functions: rows }, findings,
    ['owned-executable-statements'], ['physical-line-count', 'nested-body-double-counting', 'semantic-responsibilities']);
  const score = roundScore(multiply(add(decimal(complexity.score!), decimal(population.score)), fraction(1n, 2n)));
  const result = policyDimension('codeQuality', 'complexity-decomposition-v1', score,
    'Complexity & Decomposition: equally weighted Method Complexity and owned-statement Decomposition component scores.',
    { methodComplexity: complexity.score, decomposition: population.score, formula: '(methodComplexity + decomposition) / 2', rounding: 'half-up-one-decimal' },
    [...complexity.findings, ...findings], ['owned-function-complexity', 'owned-statement-decomposition'], ['semantic-responsibility', 'runtime-correctness']);
  const decision = result.scoringDecision!;
  decision.operation = 'mean';
  decision.steps = [
    { id: 'methodComplexity', kind: 'component', score: complexity.score!, disposition: 'contributing', inputs: { weight: 0.5 }, findingCategories: ['highFunctionComplexity'], decision: complexity.scoringDecision },
    { id: 'decomposition', kind: 'component', score: population.score, disposition: 'contributing', inputs: { weight: 0.5 }, findingCategories: ['largeFunctionBody'], decision: decomposition.scoringDecision }
  ];
  decision.findingEffects = result.findings.map(f => ({ fingerprint: f.fingerprint, category: f.category, effect: 'policyInput',
    stepIds: [f.category === 'largeFunctionBody' ? 'decomposition' : 'methodComplexity'] }));
  return { ...result, displayName: 'Complexity & Decomposition', componentDetails: {
    methodComplexity: { ...(complexity.componentDetails as { methodComplexity: object }).methodComplexity, scoringDecision: complexity.scoringDecision, scoring: complexity.scoring },
    decomposition: { ...evidence, ...decomposition, version: 3 } } };
}
