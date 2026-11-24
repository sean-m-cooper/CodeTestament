import ts from 'typescript';

export function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}
export function globalName(node: ts.Node, checker: ts.TypeChecker): boolean {
  return !(checker.getSymbolAtLocation(node)?.declarations ?? []).some(d => !d.getSourceFile().isDeclarationFile ||
    !/[/\\](typescript[/\\]lib|@types)[/\\]/.test(d.getSourceFile().fileName));
}
const writeCache = new WeakMap<ts.SourceFile, Set<ts.Symbol>>();
function writes(source: ts.SourceFile, checker: ts.TypeChecker) {
  const cached = writeCache.get(source); if (cached) return cached;
  const result = new Set<ts.Symbol>();
  const record = (node: ts.Node) => {
    if (ts.isIdentifier(node)) { const symbol = checker.getSymbolAtLocation(node); if (symbol) result.add(symbol); }
    else ts.forEachChild(node, record);
  };
  const visit = (node: ts.Node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) record(node.left);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator)) record(node.operand);
    if (ts.isDeleteExpression(node)) record(node.expression);
    if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) record(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(source); writeCache.set(source, result); return result;
}
/** Resolve lexical imports, never a method name alone. Does not follow mutable aliases. */
export function importedApi(expression: ts.Expression, checker: ts.TypeChecker): { module: string; name: string } | undefined {
  const node = unwrap(expression);
  if (ts.isPropertyAccessExpression(node)) {
    const base = importedApi(node.expression, checker);
    if (base) return { module: base.module, name: base.name === '*' || base.name === 'default' ? node.name.text : `${base.name}.${node.name.text}` };
  }
  if (!ts.isIdentifier(node)) return;
  const symbol = checker.getSymbolAtLocation(node);
  if (symbol && writes(node.getSourceFile(), checker).has(symbol)) return;
  const declarations = symbol?.declarations ?? [];
  if (declarations.length !== 1) return;
  for (const declaration of declarations) {
    let owner: ts.Node | undefined = declaration;
    while (owner && !ts.isImportDeclaration(owner) && !ts.isSourceFile(owner)) owner = owner.parent;
    if (owner && ts.isImportDeclaration(owner) && ts.isStringLiteral(owner.moduleSpecifier)) {
      if (owner.importClause?.isTypeOnly || ts.isImportSpecifier(declaration) && declaration.isTypeOnly) continue;
      const name = ts.isImportSpecifier(declaration) ? (declaration.propertyName ?? declaration.name).text :
        ts.isNamespaceImport(declaration) ? '*' : 'default';
      return { module: owner.moduleSpecifier.text.replace(/^node:/, ''), name };
    }
    const variable = ts.isVariableDeclaration(declaration) ? declaration : ts.isBindingElement(declaration) && ts.isVariableDeclaration(declaration.parent.parent) ? declaration.parent.parent : undefined;
    if (!variable?.initializer) continue;
    const init = unwrap(variable.initializer);
    if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression) || init.expression.text !== 'require' ||
      !globalName(init.expression, checker) || init.arguments.length !== 1 || !ts.isStringLiteral(init.arguments[0])) continue;
    return { module: init.arguments[0].text.replace(/^node:/, ''), name: ts.isBindingElement(declaration) ? (declaration.propertyName ?? declaration.name).getText() : '*' };
  }
}
