/**
 * findTsReferences: every module-specifier string in a JS or TS file, by parse.
 *
 * Covers import/export-from, `import()`, `import('x').T`, `import x = require()`,
 * `require()` and the vitest/jest mock family plus `extraMockCallees` (dotted,
 * e.g. `td.mock`). Spans exclude the quotes and cover the raw source, so a literal
 * written with an escape is replaced whole while `value` holds what it means.
 * An unterminated literal has no closing quote to exclude, so it is skipped.
 */

import ts from 'typescript';
import type { PathReference } from './@types/PathReference';
import { scriptKindOf } from './scriptKindOf';

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
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, scriptKindOf(path));
  const found: PathReference[] = [];
  const add = (node: ts.Node | undefined) => {
    if (!node || !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return;
    const start = node.getStart(sf) + 1;
    const end = node.getEnd() - 1;
    if (text[end] === text[start - 1]) found.push({ start, end, value: node.text });
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
