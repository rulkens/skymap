/**
 * engineSliceDispatches — the core wiring site that still dispatches an
 * engineSlice action of its own: `installLoadProgress`. Spin up a real Redux
 * store, spy on `dispatch`, drive the wiring function, assert the matching
 * action creator was called.
 *
 * `wireSlots`'s `loading` emission and `engine.ts`'s `initializing`/`error`
 * emissions are integration-level, exercised by `wireSlots.test.ts` and
 * `bootstrap.test.ts` respectively — not duplicated here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStore } from '../../../../src/store/createAppStore';
import { engineLoadProgressChanged } from '../../../../src/state/engine/engineSlice';
import { Source } from '../../../../src/data/sources';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { LoadProgressState } from '../../../../src/@types/loading/LoadProgressState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// loadProgressAggregator: capture the emit callback so we can fire it
// manually in the installLoadProgress tests.
let capturedProgressEmitFn: ((snapshot: unknown) => void) | null = null;
const attachSlotSpy = vi.fn();
vi.mock('../../../../src/services/engine/subsystems/loadProgressAggregator', () => ({
  createLoadProgressEmitter: vi.fn((emit: (snapshot: unknown) => void) => {
    capturedProgressEmitFn = emit;
    return { attachSlot: attachSlotSpy, destroy: vi.fn() };
  }),
}));

import { installLoadProgress } from '../../../../src/services/engine/wiring/installLoadProgress';
import { STUB_COMPOSITION } from '../../../helpers/engine/stubComposition';

function makeProgressState(): EngineState {
  const stubSlot = <T, Req>(name: string): AssetSlot<T, Req> => ({
    name,
    load: vi.fn(),
    current: () => null,
    committed: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  });
  return {
    subsystems: { loadProgress: null },
    // The starCatalog Layer's Gaia slot is the real-world example this fixture stands in for.
    slotsByKey: new Map([[Source.GaiaStars as SourceType, stubSlot('gaia-stars')]]),
  } as unknown as EngineState;
}

describe('installLoadProgress → engineLoadProgressChanged', () => {
  beforeEach(() => {
    capturedProgressEmitFn = null;
    attachSlotSpy.mockClear();
  });

  it('dispatches engineLoadProgressChanged(snapshot) when the emitter fires', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeProgressState();
    const deps: BootstrapDeps = {
      canvas: {} as HTMLCanvasElement,
      cb: { store } as unknown as BootstrapDeps['cb'],
      composition: STUB_COMPOSITION,
      frameRef: { current: () => {} },
      handleRef: { current: null },
      allSlots: new Map(),
      selection: {
        resolvePick: () => null,
        extractRow: () => null,
        resolveFocusId: () => null,
        focusIdOf: () => null,
      },
    };

    installLoadProgress(state, deps);

    const snapshot: LoadProgressState = { loadedBytes: 50, totalBytes: 100, inFlightCount: 2 };
    capturedProgressEmitFn!(snapshot);

    expect(spy).toHaveBeenCalledWith(engineLoadProgressChanged(snapshot));
  });
});
