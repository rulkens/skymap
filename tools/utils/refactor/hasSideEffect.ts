import ts from 'typescript';

/** Work done when the expression is evaluated; a function body only runs when called. */
export function hasSideEffect(node: ts.Node | undefined): boolean {
  if (!node) return false;
  if (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isTaggedTemplateExpression(node) ||
    ts.isYieldExpression(node) ||
    ts.isDeleteExpression(node) ||
    (ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
    ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken))
  ) {
    return true;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false;
  return ts.forEachChild(node, (child) => hasSideEffect(child) || undefined) ?? false;
}
