import { SyntaxKind } from 'typescript-native/unstable/ast';
import type { Node } from 'typescript-native/unstable/ast';
import type { Engine } from '../../../@types/refactor/Engine';
import type { NodeLocation } from '../../../@types/refactor/NodeLocation';
import { engineHandle } from './engineHandle';

/**
 * Every reference to the symbol named at `at`, the declaration included, each file once.
 * A node's `pos` includes leading trivia, so spans are rebuilt from `end` and the name's
 * length; a string-literal key ends one quote past its text.
 */
export function findReferences(engine: Engine, at: NodeLocation): readonly NodeLocation[] {
  const { snapshot } = engineHandle(engine);
  const seen = new Map<string, NodeLocation>();
  for (const project of snapshot.getProjects()) {
    const sourceFile = project.program.getSourceFile(at.file);
    if (!sourceFile) continue;
    let hit: Node | undefined;
    const visit = (node: Node): undefined => {
      if (node.pos <= at.start && at.end <= node.end) {
        hit = node;
        node.forEachChild(visit);
      }
    };
    sourceFile.forEachChild(visit);
    if (!hit) continue;
    for (const entry of project.checker.getReferencedSymbolsForNode(hit, at.start)) {
      for (const handle of entry.references) {
        const node = handle.resolve();
        if (!node) continue;
        const file = node.getSourceFile().fileName;
        if (file.includes('/node_modules/')) continue;
        const text = 'text' in node ? String(node.text) : '';
        const quoted =
          node.kind === SyntaxKind.StringLiteral ||
          node.kind === SyntaxKind.NoSubstitutionTemplateLiteral
            ? 1
            : 0;
        const end = node.end - quoted;
        seen.set(`${file}:${end}`, { file, start: end - text.length, end });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
}
