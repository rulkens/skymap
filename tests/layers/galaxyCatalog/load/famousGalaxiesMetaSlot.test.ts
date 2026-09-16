/**
 * The sidecar slot has two writers on each transition: the runtime's own cell
 * and the Layer's `famousMeta` fact. The published array must be a COPY —
 * immer freezes what the reducer stores, and a shared reference would freeze
 * the runtime's array too, so the next write would throw.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('../../../../src/layers/galaxyCatalog/load/famousGalaxiesMetaFetcher', () => ({
  famousGalaxiesMetaFetcher: mockFetch,
}));

import { createFamousGalaxiesMetaSlot } from '../../../../src/layers/galaxyCatalog/load/famousGalaxiesMetaSlot';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';

const M87: FamousGalaxyMetaEntry = {
  id: 'm87',
  names: ['M87'],
  description: '',
  type: 'elliptical',
} as FamousGalaxyMetaEntry;

const REQ = { source: 'famousGalaxy' } as never;

function harness() {
  const publish = vi.fn();
  let runtimeMeta: readonly FamousGalaxyMetaEntry[] = [];
  const slot = createFamousGalaxiesMetaSlot({ publish }, (m) => {
    runtimeMeta = m;
  });
  return { publish, slot, meta: () => runtimeMeta };
}

describe('createFamousGalaxiesMetaSlot', () => {
  it('commit publishes a COPY of the meta and writes the runtime cell', async () => {
    const meta = [M87];
    mockFetch.mockResolvedValue({ meta });
    const h = harness();

    h.slot.load(REQ);
    await vi.waitFor(() => expect(h.slot.state().kind).toBe('ready'));

    expect(h.meta()).toBe(meta);
    expect(h.publish).toHaveBeenCalledTimes(1);
    const published = h.publish.mock.calls[0]![0] as { famousMeta: readonly unknown[] };
    expect(published.famousMeta).toEqual(meta);
    // Not the payload's own array: a shared reference would be frozen by immer.
    expect(published.famousMeta).not.toBe(meta);
  });

  it('a failed fetch resets both homes to []', async () => {
    // A 404 is permanent under the retry policy, so the slot errors without
    // waiting out a backoff.
    mockFetch.mockRejectedValue(new HttpError(404, 'famous_galaxies_meta.json'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness();

    h.slot.load(REQ);
    await vi.waitFor(() => expect(h.slot.state().kind).toBe('error'));

    expect(h.meta()).toEqual([]);
    expect(h.publish).toHaveBeenCalledWith({ famousMeta: [] });
  });
});
