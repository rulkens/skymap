import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/**
 * The span to cut for the exported declaration named at `at`: its statement, the comments
 * attached above it and one line break. One declarator of `export const a = 1, b = 2` is
 * cut alone, with its comma; overload signatures go with their implementation.
 */
export function declarationSpan(text: string, at: NodeLocation): { start: number; end: number } {
  const source = parseTs(at.file, text);
  let node = findNameNode(source, at);
  while (node && node.parent !== source && !ts.isVariableDeclaration(node)) node = node.parent;
  if (!node) throw new Error(`No declaration at offset ${at.start} of ${at.file}.`);

  if (ts.isVariableDeclaration(node)) {
    const declarations = (node.parent as ts.VariableDeclarationList).declarations;
    if (declarations.length > 1) {
      const i = declarations.indexOf(node);
      const next = declarations[i + 1];
      return next
        ? { start: node.getStart(source), end: next.getStart(source) }
        : { start: declarations[i - 1]!.getEnd(), end: node.getEnd() };
    }
    node = node.parent.parent;
  }

  const last = overloadsEnd(source, node);
  const start = attachedStart(text, node, source);
  let end = last.getEnd();
  if (text[end] === '\r') end++;
  if (text[end] === '\n') end++;
  // Cutting between two blank lines would leave two in a row.
  if (/(^|\n\n)$/.test(text.slice(0, start)) && text[end] === '\n') end++;
  return { start, end };
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

// Comments that touch the statement (no blank line between) belong to it.
function attachedStart(text: string, node: ts.Node, source: ts.SourceFile): number {
  let start = node.getStart(source);
  for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) ?? [])].reverse()) {
    if (text.slice(range.end, start).split('\n').length > 2) break;
    start = range.pos;
  }
  return start;
}
