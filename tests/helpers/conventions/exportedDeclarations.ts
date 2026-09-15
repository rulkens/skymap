/**
 * ts-morph's own `getExportedDeclarations()` forces a type-checker program over
 * the whole import graph; this is the syntactic equivalent for the one shape the
 * convention sweeps need — a file's OWN exports, keyed by exported name, in
 * source order. Re-exports (`export { x } from './y'`) are deliberately not
 * followed: they surface as zero exports, so a swept file that grew one fails
 * loudly rather than passing vacuously.
 */
import { Node, SyntaxKind } from 'ts-morph';
import { parseOnlyProject } from './parseOnlyProject';

type Declared = { readonly name: string; readonly node: Node };

function declaredBy(stmt: Node): readonly Declared[] {
  if (Node.isVariableStatement(stmt)) {
    return stmt
      .getDeclarationList()
      .getDeclarations()
      .map((decl) => ({ name: decl.getName(), node: decl as Node }));
  }
  if (
    Node.isFunctionDeclaration(stmt) ||
    Node.isClassDeclaration(stmt) ||
    Node.isEnumDeclaration(stmt) ||
    Node.isTypeAliasDeclaration(stmt) ||
    Node.isInterfaceDeclaration(stmt) ||
    Node.isModuleDeclaration(stmt)
  ) {
    const name = stmt.getName();
    return name === undefined ? [] : [{ name, node: stmt as Node }];
  }
  return [];
}

export function exportedDeclarations(file: string): ReadonlyMap<string, readonly Node[]> {
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
  const byName = new Map<string, Node[]>();
  const add = (name: string, node: Node): void => {
    const existing = byName.get(name);
    if (existing === undefined) byName.set(name, [node]);
    else existing.push(node);
  };

  const local = new Map<string, Node>();
  for (const stmt of sourceFile.getStatements()) {
    const exported =
      Node.isModifierable(stmt) && stmt.hasModifier(SyntaxKind.ExportKeyword) ? true : false;
    const isDefault = Node.isModifierable(stmt) && stmt.hasModifier(SyntaxKind.DefaultKeyword);
    for (const { name, node } of declaredBy(stmt)) {
      local.set(name, node);
      if (exported) add(isDefault ? 'default' : name, node);
    }
    // `export default someExistingSymbol` / `export default <expr>`.
    if (Node.isExportAssignment(stmt) && !stmt.isExportEquals()) {
      const expr = stmt.getExpression();
      add(
        'default',
        (Node.isIdentifier(expr) ? (local.get(expr.getText()) ?? expr) : expr) as Node,
      );
    }
    // `export { a, b as c }` — the from-less form, naming symbols declared above.
    if (Node.isExportDeclaration(stmt) && stmt.getModuleSpecifier() === undefined) {
      for (const spec of stmt.getNamedExports()) {
        const declaration = local.get(spec.getName());
        if (declaration !== undefined)
          add(spec.getAliasNode()?.getText() ?? spec.getName(), declaration);
      }
    }
  }
  return byName;
}
