import ts from 'typescript';
import { globalName, importedApi, unwrap } from './source-bindings.js';
import { observationFinding, policyDimension } from './dimension-policy.js';
import type { Finding } from './evidence.js';

function literal(expression: ts.Expression | undefined, checker: ts.TypeChecker, depth = 0): boolean {
  if (!expression || depth > 4) return false;
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return true;
  if (ts.isTemplateExpression(node)) return node.templateSpans.every(span => literal(span.expression, checker, depth + 1));
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    return literal(node.left, checker, depth + 1) && literal(node.right, checker, depth + 1);
  if (!ts.isIdentifier(node)) return false;
  const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
  return !!declaration && ts.isVariableDeclaration(declaration) && !!(declaration.parent.flags & ts.NodeFlags.Const) &&
    literal(declaration.initializer, checker, depth + 1);
}
export function inspectSecurity(source: ts.SourceFile, checker: ts.TypeChecker, file: string, project: string): Finding[] {
  const findings: Finding[] = [];
  const occurrences = new Map<string, number>();
  const add = (node: ts.Node, category: string, message: string) => {
    // Hash syntax for location-stable identities; never emit literal credentials or SQL text.
    const key = `${file}|${category}|${node.getText(source)}`, ordinal = occurrences.get(key) ?? 0;
    occurrences.set(key, ordinal + 1);
    findings.push(observationFinding('security', category, `${key}|${ordinal}`, message,
      { file, project, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }, { detection: 'bounded-source-pattern', reachability: 'notAssessed' }));
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expression = unwrap(node.expression), args = node.arguments ?? [];
      if (ts.isIdentifier(expression) && ['eval', 'Function'].includes(expression.text) && globalName(expression, checker) &&
        args.length && args.some(arg => !literal(arg, checker)))
        add(node, 'dynamicCodeExecution', 'A standard code-execution API receives a nonliteral argument; review trust and validation.');
      const api = importedApi(expression, checker);
      const shell = args.some(arg => ts.isObjectLiteralExpression(arg) && arg.properties.some(p =>
        ts.isPropertyAssignment(p) && p.name.getText(source) === 'shell' && p.initializer.kind === ts.SyntaxKind.TrueKeyword));
      const shellArray = api?.module === 'child_process' && shell && ['execFile','execFileSync','spawn','spawnSync'].includes(api.name);
      const dynamicShell = shellArray && args.some(arg => ts.isArrayLiteralExpression(arg) && arg.elements.some(e => !literal(e, checker)));
      if (api?.module === 'child_process' && (['exec', 'execSync'].includes(api.name) || shellArray) && args.length && (!literal(args[0], checker) || dynamicShell))
        add(node, 'dynamicShellCommand', 'A Node shell-execution API receives a nonliteral command; review input provenance. Argument-array execFile/spawn calls are not treated as shell interpolation.');
      if (api?.module === 'vm' && ['runInContext', 'runInNewContext', 'runInThisContext', 'Script'].includes(api.name) && args.length && !literal(args[0], checker))
        add(node, 'dynamicCodeExecution', 'A Node VM API receives nonliteral code; review the trust boundary.');
    }
    if (ts.isStringLiteralLike(node) && /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(node.text))
      add(node, 'embeddedPrivateKey', 'A private-key block is embedded in production source. Key material is omitted from evidence.');
    ts.forEachChild(node, visit);
  };
  visit(source); return findings;
}
export function scoreSecurity(findings: Finding[]) {
  const keys = findings.filter(f => f.category === 'embeddedPrivateKey').length;
  const dynamic = findings.length - keys;
  // Severity caps avoid code-volume dilution and repeated deductions for the same pattern.
  const score = keys ? 2 : dynamic ? 6 : 10;
  return policyDimension('security', 'explicit-risk-patterns-v1', score,
    'Partial Security: embedded private keys and nonliteral standard code/shell execution. Absence of these patterns does not establish application security.',
    { embeddedPrivateKeys: keys, dynamicExecutionSites: dynamic, caps: { privateKey: 2, dynamicExecution: 6, noneObserved: 10 },
      vulnerabilityAssessment: 'excluded; dependency advisories belong to Dependency Management' }, findings,
    ['embedded-private-key-blocks', 'standard-eval-Function', 'node-child-process-exec', 'node-vm-code'],
    ['taint-analysis', 'SQL-injection', 'authentication', 'authorization', 'XSS', 'dependency-advisories', 'arbitrary-secret-name-heuristics']);
}
