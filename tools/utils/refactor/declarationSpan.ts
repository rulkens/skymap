import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import { attachedStart } from './attachedStart';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/**
 * The span to cut for the exported declaration named at `at`: its statement, the comments
 * attached to it and one line break. One declarator of `export const a = 1, b = 2` or one
 * specifier of `export { a, b }` is cut alone, with its comma; overload signatures go with
 * their implementation. A comment at the top of the file is the module header, not attached.
 */
export function declarationSpan(text: string, at: NodeLocation): { start: number; end: number } {
  const source = parseTs(at.file, text);
  let node = findNameNode(source, at);
  while (
    node &&
    node.parent !== source &&
    !ts.isVariableDeclaration(node) &&
    !ts.isExportSpecifier(node)
  ) {
    node = node.parent;
  }
  if (!node) throw new Error(`No declaration at offset ${at.start} of ${at.file}.`);

  if (ts.isVariableDeclaration(node) || ts.isExportSpecifier(node)) {
    const list: readonly ts.Node[] = ts.isVariableDeclaration(node)
      ? (node.parent as ts.VariableDeclarationList).declarations
      : (node.parent as ts.NamedExports).elements;
    if (list.length > 1) return cutListItem(text, source, list, node);
    node = node.parent.parent;
  }

  const last = overloadsEnd(source, node);
  const start = attachedStart(text, node, source);
  let end = last.getEnd();
  const trailing = ts.getTrailingCommentRanges(text, end) ?? [];
  if (trailing.length > 0) end = trailing[trailing.length - 1]!.end;
  if (text[end] === '\r') end++;
  if (text[end] === '\n') end++;
  // Cutting between two blank lines would leave two in a row.
  if (/(^|\n\n)$/.test(text.slice(0, start)) && text[end] === '\n') end++;
  return { start, end };
}

// One item of a comma list, with its own leading comments and the comma that follows it
// (or, for the last item, the comma before it).
function cutListItem(
  text: string,
  source: ts.SourceFile,
  list: readonly ts.Node[],
  node: ts.Node,
): { start: number; end: number } {
  const i = list.indexOf(node);
  const next = list[i + 1];
  return next
    ? { start: attachedStart(text, node, source), end: attachedStart(text, next, source) }
    : { start: list[i - 1]!.getEnd(), end: node.getEnd() };
}

// The last statement of a function's overload run, or the node itself.
function overloadsEnd(source: ts.SourceFile, node: ts.Node): ts.Node {
  if (!ts.isFunctionDeclaration(node) || !node.name) return node;
  const run = source.statements.slice(source.statements.indexOf(node as ts.Statement));
  let last: ts.Node = node;
  for (const statement of run) {
    if (!ts.isFunctionDeclaration(statement) || statement.name?.text !== node.name.text) break;
    last = statement;
  }
  return last;
}
