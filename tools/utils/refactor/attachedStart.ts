import ts from 'typescript';

/**
 * Where the node's own comments begin: those that touch it (no blank line between) belong
 * to it, except the module header, the first comment of the file or the first after a
 * shebang, which stays when the node is cut.
 */
export function attachedStart(text: string, node: ts.Node, source: ts.SourceFile): number {
  const headerStart = text.startsWith('#!') ? text.indexOf('\n') + 1 : 0;
  let start = node.getStart(source);
  for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) ?? [])].reverse()) {
    if (range.pos <= headerStart || text.slice(range.end, start).split('\n').length > 2) break;
    start = range.pos;
  }
  return start;
}
