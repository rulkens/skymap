/**
 * filenameMatchesExport — CLAUDE.md: "Filename = the exported symbol's name"
 * for src/utils/. oneSymbolPerFile.test.ts already proves each non-exempt
 * utils file exports exactly one function; this sweep is the other half —
 * that function's name must equal the file's basename (clampDistance.ts
 * exports `clampDistance`, not `clamp` or `clampDist`).
 *
 * Shares its exemption list and function-shape test with
 * oneSymbolPerFile.test.ts rather than re-deriving copies that could
 * silently drift apart.
 */
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { UTILS_MULTI_FUNCTION_FILES, isFunctionShaped } from './oneSymbolPerFile.test';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return [p];
  });
}

const project = new Project({ useInMemoryFileSystem: false });

describe('src/utils: exported function name matches its filename', () => {
  const files = walk('src/utils')
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !UTILS_MULTI_FUNCTION_FILES.has(f));
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s', (file) => {
    const sourceFile = project.addSourceFileAtPath(file);
    const exported = sourceFile.getExportedDeclarations();
    const functionEntry = [...exported.entries()].find(([, decls]) => decls.some(isFunctionShaped));
    // Constants-only modules (a lone `export const N = …`) have no function
    // to name; filename===export governs only the file that HAS one function.
    if (functionEntry === undefined) return;
    const [exportedName] = functionEntry;
    expect(exportedName).toBe(basename(file, '.ts'));
  });
});
