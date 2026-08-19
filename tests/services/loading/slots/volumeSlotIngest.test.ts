/**
 * volumeSlotIngest — cross-cutting parity net for the four volume slot
 * factories' shared ingest path (`uploadVolumeField`). No single src file
 * mirrors this test on purpose: the fact it pins is cross-file (four
 * factories, one shared ingest fn, four distinct field ids), so splitting it
 * into four one-assertion mirror files would be four files of noise —
 * `tests/services/engine/wiring/demandTable.test.ts` is the existing
 * precedent for a cross-cutting test file with no src twin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { uploadVolumeField } from '../../../../src/services/engine/volume/uploadVolumeField';

// Hoisted mock targets — `vi.mock` runs before imports, so the fetcher
// references have to live in a hoisted block the factory closures can see.
const { mockCf4Fetch, mockMcpmFetch, mockPolyphormFetch, mockSyntheticFetch } = vi.hoisted(() => ({
  mockCf4Fetch: vi.fn(),
  mockMcpmFetch: vi.fn(),
  mockPolyphormFetch: vi.fn(),
  mockSyntheticFetch: vi.fn(),
}));

vi.mock('../../../../src/services/loading/fetchers/cf4DensityFetcher', () => ({
  cf4DensityFetcher: mockCf4Fetch,
}));
vi.mock('../../../../src/services/loading/fetchers/mcpmFetcher', () => ({
  mcpmFetcher: mockMcpmFetch,
}));
vi.mock('../../../../src/services/loading/fetchers/polyphorm2MrsFetcher', () => ({
  polyphorm2MrsFetcher: mockPolyphormFetch,
}));
vi.mock('../../../../src/services/loading/fetchers/syntheticVolumeFetcher', () => ({
  syntheticVolumeFetcher: mockSyntheticFetch,
}));

vi.mock('../../../../src/services/engine/volume/uploadVolumeField', () => ({
  uploadVolumeField: vi.fn(),
}));

import { createCf4DensitySlot } from '../../../../src/services/loading/slots/cf4DensitySlot';
import { createMcpmSlot } from '../../../../src/services/loading/slots/mcpmSlot';
import { createPolyphorm2MrsSlot } from '../../../../src/services/loading/slots/polyphorm2MrsSlot';
import { createSyntheticVolumeSlots } from '../../../../src/services/loading/slots/syntheticVolumeSlots';

const ingest = vi.mocked(uploadVolumeField);

// `dims`/`valueMin`/`valueMax` are real fields the registry factories' own
// `slot.subscribe` console-log handler reads on every `ready` transition —
// an incomplete stub throws inside that (unrelated, unmocked) subscriber.
function fakeCube(): ScalarCube {
  return { dims: [4, 4, 4], valueMin: 0, valueMax: 1 } as unknown as ScalarCube;
}

// Minimal fake state/cb — `uploadVolumeField` itself is mocked, so the slots
// only need enough shape to satisfy `EngineState`/`EngineCallbacks` typing;
// the mock records exactly what each factory passed through.
function fakeState(): EngineState {
  return {
    gpu: { volumeFieldRenderer: { upload: vi.fn() } },
    settings: { volumes: { items: {} } },
    subsystems: { scheduler: { requestRender: vi.fn() } },
    assetSlots: {},
  } as unknown as EngineState;
}

function fakeCb(): EngineCallbacks {
  return { store: { dispatch: vi.fn(), getState: vi.fn() } } as unknown as EngineCallbacks;
}

describe('volume slot ingest', () => {
  beforeEach(() => {
    ingest.mockClear();
  });

  it('cf4DensitySlot ingests its cube under the cf4-density field id', async () => {
    const cube = fakeCube();
    mockCf4Fetch.mockResolvedValue(cube);
    const state = fakeState();
    const cb = fakeCb();

    const slot = createCf4DensitySlot(state, cb);
    slot.load(undefined as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(ingest).toHaveBeenCalledWith(state, cb.store, 'cf4-density', cube);
  });

  it('mcpmSlot ingests its cube under the mcpm field id', async () => {
    const cube = fakeCube();
    mockMcpmFetch.mockResolvedValue(cube);
    const state = fakeState();
    const cb = fakeCb();

    const slot = createMcpmSlot(state, cb);
    slot.load({ tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(ingest).toHaveBeenCalledWith(state, cb.store, 'mcpm', cube);
  });

  it('polyphorm2MrsSlot ingests its cube under the polyphorm-2mrs field id', async () => {
    const cube = fakeCube();
    mockPolyphormFetch.mockResolvedValue(cube);
    const state = fakeState();
    const cb = fakeCb();

    const slot = createPolyphorm2MrsSlot(state, cb);
    slot.load({ tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(ingest).toHaveBeenCalledWith(state, cb.store, 'polyphorm-2mrs', cube);
  });

  it('each synthetic fixture ingests its cube under its own debug- field id', async () => {
    const cube = fakeCube();
    mockSyntheticFetch.mockResolvedValue(cube);
    const state = fakeState();
    const cb = fakeCb();

    const slots = createSyntheticVolumeSlots(state, cb);
    slots['debug-gaussian'].load({ id: 'debug-gaussian' });
    await vi.waitFor(() => expect(slots['debug-gaussian'].state().kind).toBe('ready'));

    expect(ingest).toHaveBeenCalledWith(state, cb.store, 'debug-gaussian', cube);
  });
});
