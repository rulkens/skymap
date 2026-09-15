/**
 * The sidecar slot publishes the famous meta to TWO homes for one PR: the
 * galaxy store (the engine-side readers) and the engine slice (the command
 * palette, until PR-D). A missing store write on either transition would be
 * masked by the redux copy until PR-D deletes it, so both are pinned here.
 */
import { describe, expect, it, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('../../../../src/layers/galaxyCatalog/load/famousGalaxiesMetaFetcher', () => ({
  famousGalaxiesMetaFetcher: mockFetch,
}));

import { createFamousGalaxiesMetaSlot } from '../../../../src/services/loading/slots/famousGalaxiesMetaSlot';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { engineFamousGalaxiesMetaReported } from '../../../../src/state/engine/engineSlice';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';

const M87: FamousGalaxyMetaEntry = {
  id: 'm87',
  names: ['M87'],
  description: '',
  type: 'elliptical',
} as FamousGalaxyMetaEntry;

const REQ = { source: 'famousGalaxy' } as never;

function fakeState(): EngineState {
  return { data: createEngineData() } as unknown as EngineState;
}

function fakeCb(): EngineCallbacks {
  return { store: { dispatch: vi.fn(), getState: vi.fn() } } as unknown as EngineCallbacks;
}

describe('createFamousGalaxiesMetaSlot', () => {
  it('a settled fetch writes the payload onto state.data.galaxies.famousMeta', async () => {
    const meta = [M87];
    mockFetch.mockResolvedValue({ meta });
    const state = fakeState();
    const cb = fakeCb();

    const slot = createFamousGalaxiesMetaSlot(state, cb);
    slot.load(REQ);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(state.data.galaxies.famousMeta).toBe(meta);
    expect(cb.store.dispatch).toHaveBeenCalledTimes(1);
    expect(cb.store.dispatch).toHaveBeenCalledWith(engineFamousGalaxiesMetaReported(meta));
  });

  it('a failed fetch resets the store to []', async () => {
    // A 404 is permanent under the retry policy, so the slot errors without
    // waiting out a backoff.
    mockFetch.mockRejectedValue(new HttpError(404, 'famous_galaxies_meta.json'));
    const state = fakeState();
    state.data.galaxies.setFamousMeta([M87]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const slot = createFamousGalaxiesMetaSlot(state, fakeCb());
    slot.load(REQ);
    await vi.waitFor(() => expect(slot.state().kind).toBe('error'));

    expect(state.data.galaxies.famousMeta).toEqual([]);
  });
});
