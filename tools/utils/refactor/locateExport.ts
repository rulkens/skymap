import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import { parseTs } from './parseTs';

/** The name token of the exported declaration, or a refusal message (not exported / ambiguous). */
export function locateExport(
  text: string,
  address: SymbolAddress,
): { ok: true; at: NodeLocation } | { ok: false; refusal: string } {
  const source = parseTs(address.file, text);
  const found = declarationsNamed(source, address.symbol);
  const [first, ...rest] = found;
  if (!first) {
    return {
      ok: false,
      refusal: `Cannot resolve '${address.file}#${address.symbol}': '${address.symbol}' is not an exported declaration of '${address.file}'.`,
    };
  }
  if (rest.length > 0) {
    const candidates = found
      .map(
        ({ node }) =>
          `  - ${ts.SyntaxKind[node.kind]} (line ${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1})`,
      )
      .join('\n');
    return {
      ok: false,
      refusal: `Ambiguous symbol '${address.symbol}' in '${address.file}': ${found.length} declarations share the name:\n${candidates}`,
    };
  }
  return {
    ok: true,
    at: { file: address.file, start: first.name.getStart(source), end: first.name.getEnd() },
  };
}

// Exported by modifier, by a local `export { x }` / `export { x as symbol }` list (whatever
// the declaration's own modifier), or by a re-export `export { y as symbol } from './m'`,
// whose specifier is the declaration.
function declarationsNamed(
  source: ts.SourceFile,
  symbol: string,
): { name: ts.Identifier; node: ts.Node }[] {
  const localName = listedLocalName(source, symbol);
  const out: { name: ts.Identifier; node: ts.Node }[] = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const named = statement.exportClause;
      for (const element of named && ts.isNamedExports(named) ? named.elements : []) {
        if (ts.isIdentifier(element.name) && element.name.text === symbol) {
          out.push({ name: element.name, node: element });
        }
      }
      continue;
    }
    const exported =
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const wanted = [exported ? symbol : undefined, localName];
    if (!wanted.some((name) => name !== undefined)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && wanted.includes(decl.name.text)) {
          out.push({ name: decl.name, node: decl });
        }
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name &&
      ts.isIdentifier(statement.name) &&
      wanted.includes(statement.name.text)
    ) {
      // Overload signatures and their implementation are one declaration.
      const isOverload =
        ts.isFunctionDeclaration(statement) &&
        out.some(({ node }) => ts.isFunctionDeclaration(node));
      if (!isOverload) out.push({ name: statement.name, node: statement });
    }
  }
  return out;
}

function listedLocalName(source: ts.SourceFile, symbol: string): string | undefined {
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (element.name.text === symbol) return (element.propertyName ?? element.name).text;
    }
  }
  return undefined;
}
