import ts from 'typescript';
import { attachedStart } from './attachedStart';

/**
 * The span of one item of a comma or semicolon list, with its own leading comments and the
 * separator that follows it (for the last item, the one before it). The next item's
 * comments stay with the next item.
 */
export function cutListItem(
  text: string,
  source: ts.SourceFile,
  list: readonly ts.Node[],
  node: ts.Node,
): { start: number; end: number } {
  const i = list.indexOf(node);
  const next = list[i + 1];
  if (!next) return { start: list[i - 1]!.getEnd(), end: node.getEnd() };
  // A comment on the separator's line is not "leading" to the parser; it stays with the next item.
  const nextStart = attachedStart(text, next, source);
  const gap = text.slice(node.getEnd(), nextStart);
  const sameLine = /^[^\n]*?(?=\/[*/])/.exec(gap);
  const end = sameLine ? node.getEnd() + sameLine[0].length : nextStart;
  return { start: attachedStart(text, node, source), end };
}
