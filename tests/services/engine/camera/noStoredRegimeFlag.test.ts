/**
 * noStoredRegimeFlag — spec §4/§11's grep criterion: `camera.base.frame` (a
 * `PoseFrame`) IS the regime, so a boolean shadowing it — `isSurfaceMode`,
 * `regimeEngaged`, whatever the name — would make an inconsistent pair
 * representable, exactly the mirror-state failure the rung table exists to
 * avoid. This is an import-graph / declaration scan (ts-morph, real AST
 * nodes), not a source-text grep, in the shape of `oneMpcSeam.test.ts`: a
 * substring search bans nothing a comment or a string literal couldn't dodge,
 * where a declaration scan catches every actual field/variable regardless of
 * where in the file it sits.
 */

import { describe, it, expect } from 'vitest';
import {
  Project,
  SyntaxKind,
  type PropertyDeclaration,
  type PropertySignature,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';
import { readFileSync } from 'node:fs';
import { walkFiles } from '../../../helpers/conventions/walkFiles';

const NAME_PATTERN = /surface|regime|engaged/i;
// Exact boolean-shaped type text only: a narrowing like `true` or `false`
// (e.g. `readonly frame: false` inside a discriminated union) is still a
// stored regime bit if it carries this name, so both literal arms count
// alongside the general `boolean`.
const BOOLEAN_TYPE_TEXTS = new Set(['boolean', 'true', 'false']);

const SWEPT_DIRS: readonly string[] = [
  'src/state',
  'src/services/engine/camera',
  'src/services/camera',
  'src/@types/camera',
];

const FILES: readonly string[] = SWEPT_DIRS.flatMap((dir) => walkFiles(dir, ['.ts', '.d.ts']));

// Allow-list: pre-existing declarations the sweep's name pattern would catch
// that are NOT a regime flag. Each entry names why it is not the thing §4
// forbids. Empty — kept as the widening point a future false-positive should
// use instead of loosening NAME_PATTERN or BOOLEAN_TYPE_TEXTS.
const ALLOW_LIST: ReadonlySet<string> = new Set();

type NamedDeclaration = VariableDeclaration | PropertySignature | PropertyDeclaration;

function namedDeclarations(sourceFile: SourceFile): readonly NamedDeclaration[] {
  return [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.PropertySignature),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.PropertyDeclaration),
  ];
}

// A resolving project, not the shared parse-only one: an annotation-less
// declaration (`const engaged = a > b`) needs the CHECKER to be recognised as
// boolean. The text pre-filter below keeps the file set — and so the program —
// tiny, which is where the resolve cost actually lives.
const project = new Project({ useInMemoryFileSystem: false });

function regimeBooleanNames(file: string): string[] {
  // A declaration NAME the pattern matches is text in the file, so a file whose
  // text misses it cannot hit, and parsing it is the sweep's whole cost.
  if (!NAME_PATTERN.test(readFileSync(file, 'utf8'))) return [];

  return namedDeclarations(project.addSourceFileAtPath(file))
    .filter((decl) => NAME_PATTERN.test(decl.getName()))
    .filter((decl) => {
      const typeNode = decl.getTypeNode();
      return BOOLEAN_TYPE_TEXTS.has(
        typeNode !== undefined ? typeNode.getText() : decl.getType().getText(),
      );
    })
    .map((decl) => decl.getName());
}

describe('no stored regime flag: camera.base.frame is the only discriminant', () => {
  it('the sweep found real files across all four swept directories', () => {
    // Loud-failure guard: a typo'd dir name returns [] silently and every
    // it.each below vacuously passes — see oneMpcSeam.test.ts for the same
    // shape of check.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it.each(FILES.filter((f) => !ALLOW_LIST.has(f)))(
    '%s declares no surface/regime/engaged boolean',
    (file) => {
      expect(regimeBooleanNames(file)).toEqual([]);
    },
  );
});
