/**
 * flowFieldSlot — verifies the slot uploads the velocity cube to the flow
 * renderer and drives the first-load fade through the intent → fade bridge.
 *
 * The slot's observable effects on `ready` are the GPU upload and a single
 * `syncVisibilityFades(state, { animate: true, only: ['flow'] })` call after
 * upload. The flow row's guard (`fieldLoaded()`) is true at that point because
 * the cube was just uploaded — but the bridge is mocked here, so the guard never
 * runs and we only assert the scoped bridge call. The bridge's per-row fade + the
 * `fieldLoaded()` guard are covered by syncVisibilityFades.test.ts /
 * flowFieldRenderer.test.ts. We mock the fetcher so `slot.load()` drives a
 * deterministic ready transition without touching the network.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';

// Hoisted mock target — `vi.mock` runs before imports, so the fetcher
// reference has to live in a hoisted block the factory closure can see.
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../../src/services/loading/fetchers/flowFieldFetcher', () => ({
  flowFieldFetcher: mockFetch,
}));

vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

import { createFlowFieldSlot } from '../../../../src/services/loading/slots/flowFieldSlot';

const bridge = vi.mocked(syncVisibilityFades);

function fakeCube(): ScalarCube {
  return { dims: [4, 4, 4] } as unknown as ScalarCube;
}

// Minimal fake state — the slot touches the flow renderer's `upload` and the
// bridge. `as unknown` lets us hand the factory a stub without modelling the
// whole EngineState tree.
function fakeState(): EngineState {
  return {
    settings: { flow: { enabled: true } },
    subsystems: { fades: { fadeTo: vi.fn(async () => {}) } },
    gpu: { flowFieldRenderer: { upload: vi.fn(), fieldLoaded: vi.fn<() => boolean>(() => true) } },
    assetSlots: {},
  } as unknown as EngineState;
}

const noopCb = {} as EngineCallbacks;

describe('createFlowFieldSlot', () => {
  it('uploads the cube to the renderer and drives the fade-in through the bridge', async () => {
    const cube = fakeCube();
    mockFetch.mockResolvedValue(cube);
    const state = fakeState();

    const slot = createFlowFieldSlot(state, noopCb);
    slot.load(undefined as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The decoded cube lands on the GPU via the renderer upload.
    expect(state.gpu.flowFieldRenderer!.upload).toHaveBeenCalledWith(cube);
    // The first-load fade-in routes through the bridge, scoped to the flow row.
    expect(bridge).toHaveBeenCalledWith(state, { animate: true, only: ['flow'] });
    // Construction purity: the factory RETURNS the slot and does NOT self-install
    // it — `installSlots` (the orchestrator) owns the write.
    expect(slot.name).toBe('flow');
    expect(state.assetSlots.flow).toBeUndefined();
  });
});
