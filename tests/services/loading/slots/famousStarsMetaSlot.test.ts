/**
 * The slot's contract is graceful degradation: the fetcher throws on HTTP
 * failure so a retry policy can branch on status, and the slot's subscriber
 * maps that to "feature off" by writing an empty array. A deployment without
 * `famous_stars_meta.json` must still render stars, just without enriched
 * InfoCard text.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { createFamousStarsMetaSlot } from '../../../../src/services/loading/slots/famousStarsMetaSlot';
import { useFetchMock } from '../../../setup/fetchMock';

// Minimal fake state — the slot touches only the body store's setter.
// `as unknown as EngineState` lets us hand the factory a stub without
// modelling the whole EngineState tree.
function fakeState(): EngineState {
  return {
    data: { bodies: { setFamousStarsMeta: vi.fn() } },
  } as unknown as EngineState;
}

const noopCb = {} as EngineCallbacks;

describe('createFamousStarsMetaSlot', () => {
  const fetch = useFetchMock();

  it('writes the parsed meta into the body store on success', async () => {
    fetch.mock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 'sun',
            names: ['Sun', 'Sol'],
            constellation: '',
            spectralType: 'G2V',
            distancePc: 0,
            magV: -26.74,
            absMag: 4.83,
            radiusSolar: 1,
            temperatureK: 5778,
            description: '',
          },
        ]),
        { status: 200 },
      ),
    );
    const state = fakeState();
    const slot = createFamousStarsMetaSlot(state, noopCb);
    await slot.load({ tier: 'medium' });

    expect(state.data.bodies.setFamousStarsMeta).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'sun' })]),
    );
  });

  it('writes an empty array when the sidecar is missing', async () => {
    fetch.mock.mockResolvedValue(new Response('not found', { status: 404 }));
    const state = fakeState();
    const slot = createFamousStarsMetaSlot(state, noopCb);
    await slot.load({ tier: 'medium' }).catch(() => {});

    expect(state.data.bodies.setFamousStarsMeta).toHaveBeenCalledWith([]);
  });
});
