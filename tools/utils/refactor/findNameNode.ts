import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';

/** The deepest node whose own text spans `at`, or undefined when nothing does. */
export function findNameNode(source: ts.SourceFile, at: NodeLocation): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (node.getStart(source) <= at.start && at.end <= node.getEnd()) {
      found = node;
      ts.forEachChild(node, visit);
    }
  };
  ts.forEachChild(source, visit);
  return found;
}
