/**
 * noStoredRegimeFlag — spec §4/§11's grep criterion: `camera.base.frame` (a
 * `PoseFrame`) IS the regime, so a boolean shadowing it — `isSurfaceMode`,
 * `regimeEngaged`, whatever the name — would make an inconsistent pair
 * representable, exactly the mirror-state failure `regimeArmFor` exists to
 * avoid. This is an import-graph / declaration scan (ts-morph, real AST
 * nodes), not a source-text grep, in the shape of `oneMpcSeam.test.ts`: a
 * substring search bans nothing a comment or a string literal couldn't dodge,
 * where a declaration scan catches every actual field/variable regardless of
 * where in the file it sits.
 */

import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

function walk(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, extensions);
    return extensions.some((ext) => p.endsWith(ext)) ? [p] : [];
  });
}

const FILES: readonly string[] = SWEPT_DIRS.flatMap((dir) => walk(dir, ['.ts', '.d.ts']));

// Allow-list: pre-existing declarations the sweep's name pattern would catch
// that are NOT a regime flag. Each entry names why it is not the thing §4
// forbids. Empty at time of writing — kept as the widening point a future
// false-positive should use instead of loosening NAME_PATTERN or
// BOOLEAN_TYPE_TEXTS.
const ALLOW_LIST: ReadonlySet<string> = new Set();

const project = new Project({ useInMemoryFileSystem: false });

function regimeBooleanNames(file: string): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  const hits: string[] = [];

  const record = (name: string, typeNode: { getText(): string } | undefined, fallbackTypeText: () => string) => {
    if (!NAME_PATTERN.test(name)) return;
    const typeText = typeNode !== undefined ? typeNode.getText() : fallbackTypeText();
    if (BOOLEAN_TYPE_TEXTS.has(typeText)) hits.push(name);
  };

  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    record(decl.getName(), decl.getTypeNode(), () => decl.getType().getText());
  }
  for (const prop of sourceFile.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
    record(prop.getName(), prop.getTypeNode(), () => prop.getType().getText());
  }
  for (const prop of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyDeclaration)) {
    record(prop.getName(), prop.getTypeNode(), () => prop.getType().getText());
  }

  return hits;
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
