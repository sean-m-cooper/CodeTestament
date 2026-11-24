import { hash, scored, type Dimension, type Finding } from './evidence.js';
import { firstMatch } from './scoring-decision.js';
import { fraction, roundScore } from './score-arithmetic.js';

export function ratioScore(good: number, total: number, scale = 10): number {
  if (!Number.isSafeInteger(good) || !Number.isSafeInteger(total) || good < 0 || total < good || total < 1)
    throw new Error('Invalid scoring population');
  return roundScore(fraction(BigInt(scale * good), BigInt(total)));
}
export function policyDimension(key: string, policy: string, score: number, basis: string,
  observations: Record<string, unknown>, findings: Finding[], includes: string[], excludes: string[]): Dimension {
  const categories = [...new Set(findings.filter(f => !String(f.observations.scoreDisposition).startsWith('excluded')).map(f => f.category))];
  const decision = firstMatch(`javascript-typescript/${key}/${policy}`, observations,
    [{ id: 'population', condition: 'recorded policy inputs', matched: true, score, categories }]);
  return { ...scored(decision, basis, findings, observations),
    scope: { id: decision.policy, coverage: 'partial', includes, excludes } };
}
export function observationFinding(key: string, category: string, identity: string, message: string,
  location: { file?: string; line?: number; project?: string }, observations: Record<string, unknown> = {}): Finding {
  return { ruleId: `javascript-typescript/${key}/${category}`, category, fingerprint: hash(`${key}|${category}|${identity}`),
    severity: 'warning', confidence: 'high', message,
    ...(location.file ? { file: location.file } : {}), ...(location.line ? { line: location.line } : {}),
    ...(location.project ? { project: location.project } : {}), observations: { scoreDisposition: 'policyInput', ...observations } };
}
