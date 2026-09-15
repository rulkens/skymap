/**
 * "Function-shaped" for the src/utils sweeps: a `function` declaration, or a
 * `const` initialised to an arrow/function expression. Classified from AST kinds
 * rather than a regex, which `export const X = (a * b) / (c * d)` (a wrapped
 * continuation line that looks like a parameter list) would trip up.
 */
import { SyntaxKind, type Node } from 'ts-morph';

export function isFunctionShaped(decl: Node): boolean {
  if (decl.getKind() === SyntaxKind.FunctionDeclaration) return true;
  if (decl.getKind() === SyntaxKind.VariableDeclaration) {
    const init = decl.asKindOrThrow(SyntaxKind.VariableDeclaration).getInitializer();
    return (
      init !== undefined &&
      (init.getKind() === SyntaxKind.ArrowFunction ||
        init.getKind() === SyntaxKind.FunctionExpression)
    );
  }
  return false;
}
