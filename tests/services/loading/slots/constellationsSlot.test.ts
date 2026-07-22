/**
 * constellationsSlot — verifies the slot uploads the artifact to the renderer
 * and KICKS the demand-loaded fade on `ready`.
 *
 * This is the Bug 1 regression pin: the `constellations` fade row seeds at 0 and
 * is guarded on `renderer.hasData()`, so nothing ramps it to the (default-on)
 * master intent unless the commit — the readiness edge — drives the intent →
 * fade bridge after uploading. Without that kick the layer sat at opacity 0
 * after load and only appeared once the toggle was cycled; the name labels
 * (which multiply by the same fade) never appeared at all.
 *
 * Mirrors `filamentSlot.test.ts`: mock the fetcher for a deterministic ready
 * transition and mock the bridge to a typed spy so we assert the commit's
 * `{ animate: true, only: ['constellations'] }` call without the real per-row
 * fade walk.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ConstellationsArtifact } from '../../../../src/@types/loading/ConstellationsArtifact';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../../src/services/loading/fetchers/constellationsFetcher', () => ({
  constellationsFetcher: mockFetch,
}));

vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

import { createConstellationsSlot } from '../../../../src/services/loading/slots/constellationsSlot';

const bridge = vi.mocked(syncVisibilityFades);

function fakeArtifact(): ConstellationsArtifact {
  return {
    version: 1,
    constellations: [
      {
        name: 'Orion',
        labelAnchorPc: [200, -50, 100],
        segments: [{ aPc: [1, 2, 3], aAppMag: 0.5, bPc: [4, 5, 6], bAppMag: 1.2 }],
      },
    ],
  };
}

// Minimal fake state — the commit touches the constellation renderer + the
// fade bridge only. `as never` lets us hand the factory a stub without modelling
// the whole EngineState tree.
function fakeState(): EngineState {
  return {
    settings: { constellations: { enabled: true, intensity: 1, labels: true } },
    subsystems: {},
    gpu: { constellationRenderer: { upload: vi.fn(), hasData: () => true } },
    assetSlots: {},
  } as unknown as EngineState;
}

const noopCb = {} as EngineCallbacks;

describe('createConstellationsSlot', () => {
  it('uploads the artifact to the renderer and kicks the constellations fade on ready', async () => {
    const artifact = fakeArtifact();
    mockFetch.mockResolvedValue(artifact);
    const state = fakeState();

    const slot = createConstellationsSlot(state, noopCb);
    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The artifact lands on the GPU via the renderer upload.
    expect(state.gpu.constellationRenderer!.upload).toHaveBeenCalledWith(artifact);
    // The first-load fade-in routes through the bridge, scoped to the row — the
    // fix for the seeded-0 guarded fade never ramping up on its own.
    expect(bridge).toHaveBeenCalledWith(state, { animate: true, only: ['constellations'] });
    // Construction purity: the factory RETURNS the slot; the orchestrator installs it.
    expect(slot.name).toBe('constellations');
    expect(state.assetSlots.constellations).toBeUndefined();
  });
});
