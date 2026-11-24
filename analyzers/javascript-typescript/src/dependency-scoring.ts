import type { Dimension } from './evidence.js';
import type { DependencyInventory } from './dependency-inventory.js';
import type { DependencyMetadata } from './dependency-metadata.js';
import { policyDimension } from './dimension-policy.js';
import { fraction, roundScore } from './score-arithmetic.js';

export function scoreDependencies(dimension: Dimension, inventory: DependencyInventory, metadata: DependencyMetadata): Dimension {
  const declared = inventory.manifests.reduce((n, m) => n + m.declarations.length, 0);
  const noDependencies = inventory.manifests.length > 0 && declared === 0 && inventory.gaps.every(g => g.reason.startsWith('No '));
  if (inventory.status !== 'complete' && !noDependencies) return { ...dimension,
    basis: 'Dependency inventory is incomplete or unsupported. Resolve the recorded gaps before scoring; missing evidence is not a dependency defect.' };
  if (inventory.packages.length && metadata.status === 'notRequested') return { ...dimension,
    basis: 'Resolved inventory is available, but package health is unmeasured. Request --dependency-metadata for a Dependency Management score; an offline inventory does not establish healthy dependencies.',
    inventoryAssessment: { status: 'available', reproducibilityScore: 10, contributesToDimensionScore: false } };
  if (dimension.metadataMode === 'public-registry' && inventory.packages.length && metadata.status !== 'available') return { ...dimension,
    basis: 'Requested registry assessment is incomplete. Local inventory remains available; inaccessible metadata receives neither a healthy score nor a penalty.' };
  const rows = metadata.observations;
  const deprecated = rows.filter(r => !!r.deprecated).length;
  const outdated = rows.filter(r => r.upgrades?.some(u => u.newerWithinRange)).length;
  const severities = rows.flatMap(r => r.vulnerabilities.advisories?.map(a => a.severity) ?? []);
  const vulnerabilityCap = severities.includes('critical') ? 0 : severities.includes('high') ? 2 : severities.includes('moderate') ? 4 : severities.includes('low') ? 6 : 10;
  const weightedLoss = rows.reduce((n, r) => n + (r.deprecated ? 4 : r.upgrades?.some(u => u.newerWithinRange) ? 2 : 0), 0);
  const healthScore = rows.length ? roundScore(fraction(BigInt(10 * rows.length - weightedLoss), BigInt(rows.length))) : 10;
  const score = Math.min(healthScore, vulnerabilityCap, deprecated ? 8 : 10, outdated ? 9 : 10);
  const findings = dimension.findings.map(f => ({ ...f, severity: 'warning' as const, observations: { ...f.observations, scoreDisposition: 'policyInput' } }));
  const result = policyDimension('dependencyManagement', 'lock-and-package-health-v1', score,
    !inventory.packages.length ? 'Partial Dependency Management: no resolved external dependency population in the complete selected inventory. No advisory query was necessary.' :
      'Partial Dependency Management: resolved inventory and requested registry health. Upgrades outside declared ranges are review-only; available assets do not establish upgrade safety.',
    { inventoryComplete: true, declaredDependencies: declared, packages: inventory.packages.length, metadataStatus: metadata.status,
      deprecatedPackages: deprecated, outdatedWithinRangePackages: outdated, vulnerabilityCap, healthScore,
      countingUnit: 'distinct-package-name-version-source', profile: !inventory.packages.length ? 'no-external-dependencies' : 'lock-and-registry-health',
      weightedLoss, formula: 'min(10 - sum(max(packageDeprecationLoss4, withinRangeUpdateLoss2))/packages, vulnerabilityCap, deprecated?8:10, withinRangeUpdate?9:10)' }, findings,
    ['npm-lockfile-v2-v3', 'pnpm-lockfile-v9', 'selected-workspace-reachability', 'npm-pnpm-lock-consistency', 'deprecation-if-requested', 'within-range-updates-if-requested', 'advisories-if-requested'],
    ['upgrade-safety', 'advisory-runtime-reachability', 'outside-range-upgrade-penalties', 'private-registry-authentication']);
  return { ...dimension, ...result };
}
