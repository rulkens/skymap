import ts from 'typescript';

/** Nearest named enclosing declaration, or '<module>' for a top-level reference. */
export function enclosingLabel(source: ts.SourceFile, node: ts.Node): string {
  for (let owner = node.parent; owner; owner = owner.parent) {
    if (ts.isFunctionDeclaration(owner) && owner.name) return `function ${owner.name.text}`;
    if (ts.isMethodDeclaration(owner)) return `method ${owner.name.getText(source)}`;
    if (ts.isConstructorDeclaration(owner)) return 'constructor';
    if (ts.isClassDeclaration(owner) && owner.name) return `class ${owner.name.text}`;
    if (ts.isVariableDeclaration(owner)) return `variable ${owner.name.getText(source)}`;
  }
  return '<module>';
}
