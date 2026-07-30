/**
 * The slot's contract is graceful degradation: the fetcher throws on HTTP
 * failure so a retry policy can branch on status, and the slot's subscriber
 * maps that to "feature off" by reporting an empty array to the engine slice.
 * A deployment without `famous_galaxies_meta.json` must still render famous galaxies,
 * just without enriched InfoCard text.
 *
 * The slot reports to the store and nowhere else: it dispatches the parsed
 * payload on success and an empty array on failure, and that single dispatch
 * is the only route either the command palette or the engine has to the
 * sidecar, so the two can never diverge. Asserting on the dispatched action
 * is therefore asserting the whole contract.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { createFamousGalaxiesMetaSlot } from '../../../../src/services/loading/slots/famousGalaxiesMetaSlot';
import { engineFamousGalaxiesMetaReported } from '../../../../src/state/engine/engineSlice';
import { useFetchMock } from '../../../setup/fetchMock';

// The slot touches nothing on EngineState — it reports through `cb.store`.
const fakeState = {} as EngineState;

function fakeCb(): { cb: EngineCallbacks; dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  return { cb: { store: { dispatch } } as unknown as EngineCallbacks, dispatch };
}

describe('createFamousGalaxiesMetaSlot', () => {
  const fetch = useFetchMock();

  it('reports the parsed meta to the engine slice on success', async () => {
    fetch.mock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 'm31',
            names: ['Andromeda Galaxy', 'M31'],
            description: 'The nearest large spiral to the Milky Way.',
            type: 'Sb',
          },
        ]),
        { status: 200 },
      ),
    );
    const { cb, dispatch } = fakeCb();
    const slot = createFamousGalaxiesMetaSlot(fakeState, cb);
    await slot.load({ tier: 'medium' });

    expect(dispatch).toHaveBeenCalledWith(
      engineFamousGalaxiesMetaReported(
        expect.arrayContaining([expect.objectContaining({ id: 'm31' })]) as unknown as never[],
      ),
    );
  });

  it('reports an empty array when the sidecar is missing', async () => {
    fetch.mock.mockResolvedValue(new Response('not found', { status: 404 }));
    const { cb, dispatch } = fakeCb();
    const slot = createFamousGalaxiesMetaSlot(fakeState, cb);
    await slot.load({ tier: 'medium' }).catch(() => {});

    expect(dispatch).toHaveBeenCalledWith(engineFamousGalaxiesMetaReported([]));
  });
});
