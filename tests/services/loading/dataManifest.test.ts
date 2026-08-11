/**
 * dataManifest — the boot-fetched logical→hashed path table `dataUrl`
 * resolves through (Task 12). Every test resets the module-level memo via
 * `vi.resetModules()` + a dynamic `import()` (no production reset export —
 * see the module docblock) so each case starts from a fresh, un-fetched
 * manifest.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useFetchMock } from '../../setup/fetchMock';

describe('dataManifest', () => {
  const fetch = useFetchMock();

  beforeEach(() => {
    vi.resetModules();
  });

  it('dataUrl resolves a logical path to the hashed one the manifest names', async () => {
    fetch.mock.mockResolvedValue(
      new Response(
        JSON.stringify({ 'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin' }),
        { status: 200 },
      ),
    );
    const { loadDataManifest } = await import('../../../src/services/loading/dataManifest');
    const { dataUrl } = await import('../../../src/services/loading/fetchWithProgress');

    await loadDataManifest();

    expect(dataUrl('galaxy-catalog/v9/2mrs.bin')).toBe('/data/galaxy-catalog/v9/2mrs.a3f19c2e.bin');
  });

  it('leaves paths the manifest does not name untouched', async () => {
    fetch.mock.mockResolvedValue(
      new Response(
        JSON.stringify({ 'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin' }),
        { status: 200 },
      ),
    );
    const { loadDataManifest } = await import('../../../src/services/loading/dataManifest');
    const { dataUrl } = await import('../../../src/services/loading/fetchWithProgress');

    await loadDataManifest();

    expect(dataUrl('images/famous-hires/m31.webp')).toBe('/data/images/famous-hires/m31.webp');
  });

  it('a missing manifest leaves resolution as identity and never rejects', async () => {
    fetch.mock.mockRejectedValue(new Error('network down'));
    const { loadDataManifest } = await import('../../../src/services/loading/dataManifest');
    const { dataUrl } = await import('../../../src/services/loading/fetchWithProgress');

    await expect(loadDataManifest()).resolves.toBeUndefined();

    expect(dataUrl('galaxy-catalog/v9/2mrs.bin')).toBe('/data/galaxy-catalog/v9/2mrs.bin');
  });

  it('fetches the manifest once for concurrent callers', async () => {
    fetch.mock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const { loadDataManifest } = await import('../../../src/services/loading/dataManifest');

    const first = loadDataManifest();
    const second = loadDataManifest();
    await Promise.all([first, second]);

    expect(fetch.mock).toHaveBeenCalledTimes(1);
  });
});
