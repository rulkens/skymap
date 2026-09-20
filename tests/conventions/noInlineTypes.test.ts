/**
 * noInlineTypes — CLAUDE.md: "types never live inline in implementation
 * files", a `.tsx` component's own `Props` the one exception. No compiler
 * check enforces this, so it's a sweep, same ratchet idiom as
 * typeFilesAreDeclarations.test.ts and frameFilePurity.test.ts: an entry
 * must still exist and still violate, so a fixed file has to be removed.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Node } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { INLINE_TYPE_FILES } from '../helpers/conventions/inlineTypeFiles';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';

const SKIP_NAMES = new Set(['node_modules', '@types', 'types']);
const SKIP_PATHS = new Set(['tools/stars-rs/target', 'tools/vendor-types']);

function sourceFilesUnder(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_NAMES.has(entry.name) || SKIP_PATHS.has(path)) continue;
      out.push(...sourceFilesUnder(path));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      if (entry.name.endsWith('.generated.ts')) continue;
      out.push(path);
    }
  }
  return out;
}

const files = [...sourceFilesUnder('src'), ...sourceFilesUnder('tools')];
expect(files.length).toBeGreaterThan(0);

/** A top-level `type`/`interface` not exempted as a `.tsx` file's own `*Props`. */
function hasInlineType(file: string): boolean {
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
  const isTsx = file.endsWith('.tsx');
  return sourceFile.getStatements().some((stmt) => {
    if (!Node.isTypeAliasDeclaration(stmt) && !Node.isInterfaceDeclaration(stmt)) return false;
    return !(isTsx && stmt.getName().endsWith('Props'));
  });
}

describe('no inline type/interface declarations outside a types home', () => {
  it.each(files.filter((f) => !INLINE_TYPE_FILES.has(f)))('%s', (file) => {
    expect(hasInlineType(file)).toBe(false);
  });

  it.each([...INLINE_TYPE_FILES])('%s still declares an inline type', (file) => {
    expect(files).toContain(file);
    expect(hasInlineType(file)).toBe(true);
  });
});
