import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { XATLAS_WASM_VERSION } from '../../../../tools/scene-recon/atlas/packCharts';

describe('packCharts', () => {
  it('XATLAS_WASM_VERSION matches the installed dependency', async () => {
    const pkg = JSON.parse(
      await readFile(new URL('../../../../package.json', import.meta.url), 'utf8'),
    ) as { devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.['xatlas-wasm']).toBe(XATLAS_WASM_VERSION);
  });
});
