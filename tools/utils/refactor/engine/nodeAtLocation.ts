import type { Node, SourceFile } from 'typescript-native/unstable/ast';
import type { NodeLocation } from '../../../@types/refactor/NodeLocation';

/** The deepest node whose span (leading trivia included) holds `at`, or undefined. */
export function nodeAtLocation(sourceFile: SourceFile, at: NodeLocation): Node | undefined {
  let hit: Node | undefined;
  const visit = (node: Node): undefined => {
    if (node.pos <= at.start && at.end <= node.end) {
      hit = node;
      node.forEachChild(visit);
    }
  };
  sourceFile.forEachChild(visit);
  return hit;
}
