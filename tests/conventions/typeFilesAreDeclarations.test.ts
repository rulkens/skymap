/**
 * typeFilesAreDeclarations — CLAUDE.md's `@types/` file shape: the file is
 * `.d.ts`, and it exports at most one symbol, which must be a `type` alias
 * named for the file (zero exports = an ambient shim, always fine). Both
 * debt ledgers are ratchets, same idiom as frameFilePurity.test.ts: an entry
 * must still exist and still violate, so a fixed file has to be removed.
 */
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { exportedDeclarations } from '../helpers/conventions/exportedDeclarations';
import { TYPE_FILES_MULTI_EXPORT } from '../helpers/conventions/typeFilesMultiExport';
import { TYPE_FILES_PENDING_DTS } from '../helpers/conventions/typeFilesPendingDts';
import { walkFiles } from '../helpers/conventions/walkFiles';

const SKIP_NAMES = new Set(['node_modules']);
const SKIP_PATHS = new Set(['tools/stars-rs/target', 'tools/vendor-types']);

// `@types/` folders live at different depths (`src/@types`, each Layer's own
// `src/layers/<name>/@types`, `tools/@types`, `tools/mcpm-workbench/@types`,
// …), so this walks looking for the folder name rather than trusting a fixed
// depth — a new Layer's or tool's `@types/` is swept the day it appears.
function typesDirsUnder(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    if (SKIP_NAMES.has(entry.name) || SKIP_PATHS.has(path)) continue;
    if (entry.name === '@types') out.push(path);
    else out.push(...typesDirsUnder(path));
  }
  return out;
}

const TYPES_DIRS = [...typesDirsUnder('src'), ...typesDirsUnder('tools')];
const files = TYPES_DIRS.flatMap((dir) => walkFiles(dir, ['.ts']));
expect(files.length).toBeGreaterThan(0);

/** True when the file's exports don't match "zero, or one type alias named for the file". */
function exportShapeViolation(file: string): boolean {
  const exported = exportedDeclarations(file);
  if (exported.size === 0) return false;
  if (exported.size > 1) return true;
  const [name, decls] = [...exported.entries()][0]!;
  const base = basename(file)
    .replace(/\.d\.ts$/, '')
    .replace(/\.ts$/, '');
  return (
    decls.length !== 1 || decls[0]!.getKind() !== SyntaxKind.TypeAliasDeclaration || name !== base
  );
}

describe('@types files are .d.ts', () => {
  it.each(files.filter((f) => !TYPE_FILES_PENDING_DTS.has(f)))('%s', (file) => {
    expect(file.endsWith('.d.ts')).toBe(true);
  });

  it.each([...TYPE_FILES_PENDING_DTS])('%s still needs the .d.ts rename', (file) => {
    expect(files).toContain(file);
    expect(file.endsWith('.d.ts')).toBe(false);
  });
});

describe('@types files export at most one named type alias', () => {
  it.each(files.filter((f) => !TYPE_FILES_MULTI_EXPORT.has(f)))('%s', (file) => {
    expect(exportShapeViolation(file)).toBe(false);
  });

  it.each([...TYPE_FILES_MULTI_EXPORT])('%s still exports more than one type', (file) => {
    expect(files).toContain(file);
    expect(exportShapeViolation(file)).toBe(true);
  });
});
