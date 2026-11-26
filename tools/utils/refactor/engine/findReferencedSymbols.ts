import { SyntaxKind } from 'typescript-native/unstable/ast';
import type { Node } from 'typescript-native/unstable/ast';
import type { Engine } from '../../../@types/refactor/Engine';
import type { NodeLocation } from '../../../@types/refactor/NodeLocation';
import type { ReferencedSymbols } from '../../../@types/refactor/ReferencedSymbols';
import type { RelatedDeclaration } from '../../../@types/refactor/RelatedDeclaration';
import { engineHandle } from './engineHandle';
import { nodeAtLocation } from './nodeAtLocation';

const TYPE_MEMBERS = new Set([
  SyntaxKind.PropertySignature,
  SyntaxKind.MethodSignature,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);

/**
 * Every reference to the symbol named at `at`, the declaration included, each file once,
 * and the other declarations the engine groups with it (`interface Sub extends Base`
 * re-declaring `radius` answers with both, a library base's member too). A node's `pos`
 * includes leading trivia, so spans are rebuilt from `end` and the name's length; a quoted
 * key (string or template literal) ends one quote past its text.
 */
export function findReferencedSymbols(engine: Engine, at: NodeLocation): ReferencedSymbols {
  const { snapshot } = engineHandle(engine);
  const seen = new Map<string, NodeLocation>();
  const related = new Map<string, RelatedDeclaration>();
  for (const project of snapshot.getProjects()) {
    const sourceFile = project.program.getSourceFile(at.file);
    const hit = sourceFile && nodeAtLocation(sourceFile, at);
    if (!hit) continue;
    for (const entry of project.checker.getReferencedSymbolsForNode(hit, at.start)) {
      const definition = entry.definition.resolve();
      if (definition && !holds(definition, at)) {
        related.set(
          `${definition.getSourceFile().fileName}:${definition.end}`,
          describe(definition),
        );
      }
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
  const references = [...seen.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.start - b.start,
  );
  return { references, related: [...related.values()] };
}

function holds(definition: Node, at: NodeLocation): boolean {
  return (
    definition.getSourceFile().fileName === at.file &&
    definition.pos <= at.start &&
    at.end <= definition.end
  );
}

function describe(definition: Node): RelatedDeclaration {
  const source = definition.getSourceFile();
  const parent = definition.parent;
  const typeMember =
    TYPE_MEMBERS.has(definition.kind) &&
    (parent.kind === SyntaxKind.InterfaceDeclaration || parent.kind === SyntaxKind.TypeLiteral);
  const named = parent.kind === SyntaxKind.TypeLiteral ? parent.parent : parent;
  const name = 'name' in named ? (named.name as { text?: string } | undefined)?.text : undefined;
  return {
    file: source.fileName,
    line: source.getLineAndCharacterOfPosition(definition.end - 1).line + 1,
    owner: name ?? '(anonymous type)',
    typeMember,
  };
}
