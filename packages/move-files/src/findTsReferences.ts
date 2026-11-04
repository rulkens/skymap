/**
 * findTsReferences: every module-specifier string in a TS/TSX file, by parse.
 *
 * Covers import/export-from, `import()`, `import('x').T`, `import x = require()`,
 * `require()` and the vitest/jest mock family plus `extraMockCallees` (dotted,
 * e.g. `td.mock`). Spans exclude the quotes. A literal with an escape is skipped,
 * since its source text is not its value and a splice would corrupt it.
 */

import ts from 'typescript';
import type { PathReference } from './@types/PathReference';

const MOCK_METHODS = [
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importActual',
  'importMock',
  'requireActual',
  'requireMock',
];

function dottedName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (!ts.isPropertyAccessExpression(node)) return null;
  const head = dottedName(node.expression);
  return head === null ? null : `${head}.${node.name.text}`;
}

export function findTsReferences(
  path: string,
  text: string,
  extraMockCallees: readonly string[],
): PathReference[] {
  const callees = new Set(extraMockCallees);
  for (const owner of ['vi', 'jest']) for (const m of MOCK_METHODS) callees.add(`${owner}.${m}`);
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, kind);
  const found: PathReference[] = [];
  const add = (node: ts.Node | undefined) => {
    if (!node || !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return;
    const start = node.getStart(sf) + 1;
    const end = node.getEnd() - 1;
    if (text.slice(start, end) === node.text) found.push({ start, end, value: node.text });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
      else {
        const callee = dottedName(node.expression);
        if (callee === 'require' || (callee !== null && callees.has(callee)))
          add(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
