/**
 * The slot's contract is graceful degradation: the fetcher throws on HTTP
 * failure so a retry policy can branch on status, and the slot's subscriber
 * maps that to "feature off" by reporting an empty array to the engine slice.
 * A deployment without `famous_stars_meta.json` must still render stars, just
 * without enriched InfoCard text.
 *
 * The slot reports to the store and nowhere else — the engine itself never
 * reads this payload, so a second copy on the body store would be a home with
 * no reader. Asserting on the dispatched action is therefore asserting the
 * whole contract.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { createFamousStarsMetaSlot } from '../../../../src/services/loading/slots/famousStarsMetaSlot';
import { engineFamousStarsMetaReported } from '../../../../src/state/engine/engineSlice';
import { useFetchMock } from '../../../setup/fetchMock';

// The slot touches nothing on EngineState — it reports through `cb.store`.
const fakeState = {} as EngineState;

function fakeCb(): { cb: EngineCallbacks; dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  return { cb: { store: { dispatch } } as unknown as EngineCallbacks, dispatch };
}

describe('createFamousStarsMetaSlot', () => {
  const fetch = useFetchMock();

  it('reports the parsed meta to the engine slice on success', async () => {
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
    const { cb, dispatch } = fakeCb();
    const slot = createFamousStarsMetaSlot(fakeState, cb);
    await slot.load({ tier: 'medium' });

    expect(dispatch).toHaveBeenCalledWith(
      engineFamousStarsMetaReported(
        expect.arrayContaining([expect.objectContaining({ id: 'sun' })]) as unknown as never[],
      ),
    );
  });

  it('reports an empty array when the sidecar is missing', async () => {
    fetch.mock.mockResolvedValue(new Response('not found', { status: 404 }));
    const { cb, dispatch } = fakeCb();
    const slot = createFamousStarsMetaSlot(fakeState, cb);
    await slot.load({ tier: 'medium' }).catch(() => {});

    expect(dispatch).toHaveBeenCalledWith(engineFamousStarsMetaReported([]));
  });
});
