/**
 * filenameMatchesExport — CLAUDE.md: "Filename = the exported symbol's name"
 * for src/utils/. oneSymbolPerFile.test.ts already proves each non-exempt
 * utils file exports exactly one function; this sweep is the other half —
 * that function's name must equal the file's basename (clampDistance.ts
 * exports `clampDistance`, not `clamp` or `clampDist`).
 *
 * Its exemption list and function-shape test live in tests/helpers/conventions/
 * so the two sweeps share one copy without either importing the other's test
 * file (which would re-register and re-run that whole suite here).
 */
import { describe, it, expect } from 'vitest';
import { basename } from 'node:path';
import { exportedDeclarations } from '../helpers/conventions/exportedDeclarations';
import { isFunctionShaped } from '../helpers/conventions/isFunctionShaped';
import { utilsFunctionSweepFiles } from '../helpers/conventions/utilsFunctionSweepFiles';

describe('src/utils: exported function name matches its filename', () => {
  expect(utilsFunctionSweepFiles.length).toBeGreaterThan(0);

  it.each(utilsFunctionSweepFiles)('%s', (file) => {
    const functionEntry = [...exportedDeclarations(file).entries()].find(([, decls]) =>
      decls.some(isFunctionShaped),
    );
    // Constants-only modules (a lone `export const N = …`) have no function
    // to name; filename===export governs only the file that HAS one function.
    if (functionEntry === undefined) return;
    const [exportedName] = functionEntry;
    expect(exportedName).toBe(basename(file, '.ts'));
  });
});
