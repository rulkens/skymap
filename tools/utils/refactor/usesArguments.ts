import ts from 'typescript';

/** Does the function's body read `arguments`? An arrow function inherits it; any other nested function has its own. */
export function usesArguments(fn: ts.SignatureDeclaration): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && node.text === 'arguments') return true;
    if (node !== fn && ts.isFunctionLike(node) && !ts.isArrowFunction(node)) return false;
    return ts.forEachChild(node, (child) => visit(child) || undefined) ?? false;
  };
  const body = (fn as ts.FunctionLikeDeclaration).body;
  return body ? visit(body) : false;
}
