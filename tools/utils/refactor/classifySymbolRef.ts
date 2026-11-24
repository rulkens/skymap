import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { SymbolRefKind } from '../../@types/refactor/SymbolRefKind';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/** `text` is the file's text; `at` a reference inside it. */
export function classifySymbolRef(text: string, at: NodeLocation): SymbolRefKind {
  const node = findNameNode(parseTs(at.file, text), at);
  if (!node) return 'value';
  for (let up: ts.Node | undefined = node; up; up = up.parent) {
    if (ts.isImportDeclaration(up)) return 'import';
    // Covers `export { x }` and `export { x } from`; `export const y = x` is a value use.
    if (ts.isExportDeclaration(up)) return 're-export';
  }
  // A qualified name or property access (`Ns.Foo`) is one reference, so step over it; so is
  // the left of a qualified type (`Kind.A`).
  let outer: ts.Node = node;
  while (
    outer.parent &&
    (ts.isQualifiedName(outer.parent) ||
      (ts.isPropertyAccessExpression(outer.parent) && outer.parent.name === outer))
  ) {
    outer = outer.parent;
  }
  const parent = outer.parent;
  if (parent && isTypePosition(parent)) return 'type-position';
  if (
    parent &&
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    parent.expression === outer
  ) {
    return 'call';
  }
  return 'value';
}

// `class A extends B` is a runtime read of B; `implements` and interface `extends` are types.
function isTypePosition(parent: ts.Node): boolean {
  if (ts.isExpressionWithTypeArguments(parent)) {
    const clause = parent.parent;
    return (
      ts.isHeritageClause(clause) &&
      (clause.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(clause.parent))
    );
  }
  return ts.isTypeNode(parent);
}
