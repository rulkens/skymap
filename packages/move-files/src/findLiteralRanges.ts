import ts from 'typescript';
import { scriptKindOf } from './scriptKindOf';

/** Source ranges of every string literal and template part, so a text hit can be told from a comment. */
export function findLiteralRanges(path: string, text: string): [number, number][] {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, scriptKindOf(path));
  const ranges: [number, number][] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      ranges.push([node.getStart(sf), node.getEnd()]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return ranges;
}
