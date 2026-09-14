/**
 * oneTagReader — spec §2/§3's structural gate: `PoseFrame`'s spelling (the bare
 * `'absolute'` string, the `{ body }` object) is vocabulary, not a branch.
 * Outside `rungs/`, ask `rungKindOf` / `isWorldArm` / `hostOf` / `frameKey`.
 * A declaration scan (ts-morph, real AST nodes) rather than a source-text grep,
 * per `conventions/testing.md`: a substring search bans nothing a comment or a
 * string literal couldn't dodge, and would trip on the unrelated `.frame.bodyId`
 * of the render slabs.
 */

import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind, Node, type BinaryExpression } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SWEPT_DIRS: readonly string[] = [
  'src/state',
  'src/services/camera',
  'src/services/engine/camera',
  'src/services/engine/frame',
  'src/services/engine/helpers',
  'src/services/engine/animation',
  'src/utils/camera',
  'src/components/DebugPanel',
];

// `.d.ts` excluded: a type literal `'absolute'` is a declaration of the
// vocabulary, not a branch on it.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    if (p.endsWith('.d.ts')) return [];
    return p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

// The allow-list is a DIRECTORY, not a file list: a new row file needs no edit
// here, while any file outside the vocabulary's own folder needs a justified
// one — which is the whole point of the ratchet.
const VOCABULARY_DIR = 'src/services/engine/camera/rungs/';

const FILES: readonly string[] = SWEPT_DIRS.flatMap(walk).filter(
  (f) => !f.startsWith(VOCABULARY_DIR),
);

const project = new Project({ useInMemoryFileSystem: false });

// `rungKindOf(x) === 'absolute'` compares the vocabulary's ANSWER, a `RungKind`,
// not the frame's spelling — the table is keyed by that kind, so branching on it
// is the sanctioned route and stays legal outside `rungs/`.
function comparesTheTag(node: BinaryExpression): boolean {
  const op = node.getOperatorToken().getKind();
  if (op !== SyntaxKind.EqualsEqualsEqualsToken && op !== SyntaxKind.ExclamationEqualsEqualsToken) {
    return false;
  }
  const sides = [node.getLeft(), node.getRight()];
  if (!sides.some((s) => Node.isStringLiteral(s) && s.getLiteralValue() === 'absolute'))
    return false;
  return !sides.some(
    (s) => Node.isCallExpression(s) && s.getExpression().getText() === 'rungKindOf',
  );
}

function tagComparisons(file: string): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter(comparesTheTag)
    .map((node) => node.getText());
}

function frameBodyReads(file: string): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  return (
    sourceFile
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      // `body` EXACTLY: `view.slab.frame.bodyId` is the render slab's frame, a
      // different type with ~30 legitimate sites under `frame/passes/`, and a
      // suffix match would turn this gate into noise on day one.
      .filter((node) => node.getName() === 'body')
      .filter((node) => {
        const target = node.getExpression();
        if (Node.isPropertyAccessExpression(target)) return target.getName() === 'frame';
        return Node.isIdentifier(target) && target.getText() === 'frame';
      })
      .map((node) => node.getText())
  );
}

describe('the rung vocabulary is the only reader of the frame tag', () => {
  it('the sweep found real files in every swept directory', () => {
    // Loud-failure guard: a typo'd dir returns [] and every it.each below
    // passes vacuously — same shape as noStoredRegimeFlag/oneMpcSeam.
    expect(FILES.length).toBeGreaterThan(20);
    for (const dir of SWEPT_DIRS) {
      expect(FILES.filter((f) => f.startsWith(`${dir}/`)).length).toBeGreaterThan(0);
    }
  });

  it.each(FILES)("%s compares no PoseFrame against 'absolute'", (file) => {
    expect(tagComparisons(file)).toEqual([]);
  });

  it.each(FILES)('%s does not read .frame.body', (file) => {
    expect(frameBodyReads(file)).toEqual([]);
  });
});
