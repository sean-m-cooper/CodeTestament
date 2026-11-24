import fs from 'node:fs';
import path from 'node:path';
import { walk, type PackageInput } from './discovery.js';
import { observationFinding, policyDimension, ratioScore } from './dimension-policy.js';

export const relativeFile = (root: string, file: string) => path.relative(root, file).replaceAll('\\', '/');
export function ownedProjectFiles(packages: PackageInput[]) {
  const owned = new Set<string>();
  return [...packages].sort((a,b) => b.root.length - a.root.length).map(pkg => ({ pkg,
    files: walk(pkg.root).filter(file => {
      if (owned.has(file)) return false;
      owned.add(file); return true;
    }) }));
}
export function scoreDocumentation(packages: PackageInput[], root: string) {
  const inputs = new Set<string>();
  const rows = packages.filter(pkg => pkg.files.length).map(pkg => {
    const local = fs.readdirSync(pkg.root).filter(file => /^readme(?:\.(?:md|mdx|rst|txt))?$/i.test(file)).sort();
    const fallback = pkg.root !== root ? fs.readdirSync(root).filter(file => /^readme(?:\.(?:md|mdx|rst|txt))?$/i.test(file)).sort() : [];
    const readmes = [...local.map(file => path.join(pkg.root, file)), ...fallback.map(file => path.join(root, file))]
      .filter(file => fs.lstatSync(file).isFile());
    for (const file of readmes) inputs.add(file);
    const texts = readmes.map(file => fs.readFileSync(file, 'utf8'));
    const text = texts.join('\n');
    const readable = texts.some(t => t.replace(/[#*`\s]/g, '').length >= 40);
    const usage = readable && /\b(usage|getting started|quick\s?start|installation|installing|example)\b/i.test(text);
    const verification = readable && /\b(testing|tests?|verification|contributing)\b/i.test(text);
    return { project: pkg.name, manifest: relativeFile(root, pkg.entryPoint), readmes: readmes.map(file => relativeFile(root, file)), readable, usage, verification,
      points: (readable ? 4 : 0) + (usage ? 3 : 0) + (verification ? 3 : 0) };
  });
  const findings = rows.filter(r => r.points < 10).map(r => observationFinding('documentation', 'missingProjectGuidance', r.manifest,
    'Project guidance is missing one or more measured signals: substantive README, usage/install/example guidance, and testing/contributing guidance.',
    { file: r.manifest, project: r.project }, { readable: r.readable, usage: r.usage, verification: r.verification }));
  const dimension = policyDimension('documentation', 'project-guidance-v1', rows.length ? ratioScore(rows.reduce((n,r) => n + r.points, 0), 10 * rows.length) : 0,
    'Partial Documentation: README presence and discoverable usage/testing guidance, averaged across production packages. Text signals do not establish accuracy or completeness.',
    { packages: rows, weights: { readable: 4, usage: 3, verification: 3 } }, findings,
    ['selected-package-or-repository-README', 'usage-and-verification-guidance-signals'], ['documentation-correctness', 'API-doc-coverage', 'language-independent-understanding']);
  return { dimension, inputs: [...inputs] };
}
