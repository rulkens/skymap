/**
 * CLAUDE.md's `@types/` file shape: `.d.ts`, exporting at most one `type` alias named for the
 * file (zero exports = an ambient shim, always fine). The multi-export debt ledger is a ratchet,
 * same idiom as serviceFilePurity.test.ts: an entry must still exist and still violate, or be removed.
 */
import { basename } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { dirsNamed } from '../helpers/conventions/dirsNamed';
import { exportedDeclarations } from '../helpers/conventions/exportedDeclarations';
import { TYPE_FILES_MULTI_EXPORT } from '../helpers/conventions/typeFilesMultiExport';
import { walkFiles } from '../helpers/conventions/walkFiles';

const TYPES_DIRS = [
  'src',
  'tools',
  'packages/website/src',
  'packages/desktop/src',
  'packages/studio/src',
].flatMap((root) => dirsNamed(root, '@types'));
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
  it.each(files)('%s', (file) => {
    expect(file.endsWith('.d.ts')).toBe(true);
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
