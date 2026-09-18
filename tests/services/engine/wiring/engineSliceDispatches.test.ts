/**
 * engineSliceDispatches — the core wiring sites that still dispatch an
 * engineSlice action of their own: `wireStructureProjection` and
 * `installLoadProgress`. Spin up a real Redux store, spy on `dispatch`, drive
 * the wiring function, assert the matching action creator was called.
 *
 * `wireSlots`'s `loading` emission and `engine.ts`'s `initializing`/`error`
 * emissions are integration-level, exercised by `wireSlots.test.ts` and
 * `bootstrap.test.ts` respectively — not duplicated here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStore } from '../../../../src/store/createAppStore';
import {
  engineStructureCountsChanged,
  engineLoadProgressChanged,
} from '../../../../src/state/engine/engineSlice';
import { Source } from '../../../../src/data/sources';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { ASSET_WIRING } from '../../../../src/services/engine/wiring/assetWiring';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { EngineAssetSlots } from '../../../../src/@types/engine/state/EngineAssetSlots';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { LoadProgressState } from '../../../../src/@types/loading/LoadProgressState';
import type { StructureCatalogPayload } from '../../../../src/@types/loading/StructureCatalogPayload';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// ── Module mocks needed for wiring helpers ──────────────────────────────────

// buildStaticAnchorStructures + structureCatalogToStructures: deterministic
// minimal lists for wireStructureProjection tests.
vi.mock('../../../../src/data/structure/buildStaticAnchorStructures', () => ({
  buildStaticAnchorStructures: vi.fn(() => [
    {
      id: 'cluster-virgo',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0.016],
      physicalRadiusMpc: 2.2,
      featured: true,
    },
    {
      id: 'group-local-group',
      name: 'Local Group',
      category: 'group',
      worldPos: [0, 0, 0],
      physicalRadiusMpc: 0.16,
      apparentRadiusMpc: 0.94,
      featured: true,
    },
  ]),
}));

vi.mock('../../../../src/services/engine/wiring/structureCatalogToStructures', () => ({
  structureCatalogToStructures: vi.fn((payload: StructureCatalogPayload) =>
    payload.meta.map((m) => ({
      id: `cluster-bulk-${m.id}`,
      name: m.names[0],
      category: 'cluster',
      worldPos: [0, 0, 0],
      physicalRadiusMpc: 2,
      featured: false,
    })),
  ),
}));

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

// ── Post-mock imports ───────────────────────────────────────────────────────

import { wireStructureProjection } from '../../../../src/services/engine/wiring/wireStructureProjection';
import { installLoadProgress } from '../../../../src/services/engine/wiring/installLoadProgress';
import { STUB_COMPOSITION } from '../../../helpers/engine/stubComposition';

// ── Shared helpers ──────────────────────────────────────────────────────────

function makeStructureState(): {
  state: EngineState;
  fireSlot: (s: LoadState<StructureCatalogPayload>) => void;
} {
  const listeners = new Set<(s: LoadState<StructureCatalogPayload>) => void>();
  const state = {
    data: createEngineData(),
    assetSlots: {
      structureCatalog: {
        name: 'structure-catalog',
        subscribe: (fn: (s: LoadState<StructureCatalogPayload>) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        load: vi.fn(),
        state: () => ({ kind: 'idle' }),
        current: () => null,
        lastRequest: () => null,
        startedAtMs: () => null,
        forceReload: vi.fn(),
        cancel: vi.fn(),
        release: vi.fn(),
      },
    },
  } as unknown as EngineState;
  return {
    state,
    fireSlot: (s) => {
      for (const fn of listeners) fn(s);
    },
  };
}

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
  // Typed as the real bag, not cast: `isCoreSlotFieldKey` tests `key in slots`
  // at RUNTIME, so a fixture carrying fields production dropped would still walk
  // — and pin a shape that no longer exists.
  const assetSlots: EngineAssetSlots = {
    // A keyed family with a member, so the per-source map walk is exercised.
    starCatalogs: new Map([[Source.GaiaStars as SourceType, stubSlot('gaia-stars')]]),
    famousStarsMeta: stubSlot('famous-stars-meta'),
    structureCatalog: stubSlot('structure-catalog'),
    cf4Density: stubSlot('cf4Density'),
    mcpm: stubSlot('mcpm'),
    polyphorm2Mrs: stubSlot('polyphorm-2mrs'),
    mcpmWorkbench: stubSlot('mcpm-workbench'),
    constellations: stubSlot('constellations'),
    bodyTextureAtlas: stubSlot('body-texture-atlas'),
    // Empty keyed families: installLoadProgress walks them like starCatalogs.
    bodyTextures: new Map(),
    meshBodies: new Map(),
  };
  return {
    assetSlots,
    subsystems: { loadProgress: null },
    // The composed lists `createLayers` would have written; over an empty layer
    // tuple they are core's own registry, and no Layer owns a slot.
    assetRows: expandCompanionRows(ASSET_WIRING),
    layerSlots: new Map(),
  } as unknown as EngineState;
}

// ── wireStructureProjection: engineStructureCountsChanged ──────────────────

describe('wireStructureProjection → engineStructureCountsChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches engineStructureCountsChanged with four-category counts at boot', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const { state } = makeStructureState();
    const cb = { store, sources: {} } as unknown as EngineCallbacks;

    wireStructureProjection(state, cb);

    expect(spy).toHaveBeenCalledWith(
      engineStructureCountsChanged(
        expect.objectContaining({
          cluster: expect.any(Number),
          supercluster: expect.any(Number),
          void: expect.any(Number),
          group: expect.any(Number),
        }),
      ),
    );
  });
});

// ── installLoadProgress: engineLoadProgressChanged ─────────────────────────

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
      detachControlsRef: { current: null },
      handleRef: { current: null },
      allSlots: new Map(),
      // installLoadProgress never reads a resolver — a resolver that always
      // returns null is enough to satisfy the type.
      selection: {
        resolvePick: () => null,
        extractRow: () => null,
        resolveFocusId: () => null,
        focusIdOf: () => null,
      },
    };

    installLoadProgress(state, deps);

    // The mock captured the emit callback — fire it with a real snapshot.
    const snapshot: LoadProgressState = { loadedBytes: 50, totalBytes: 100, inFlightCount: 2 };
    capturedProgressEmitFn!(snapshot);

    expect(spy).toHaveBeenCalledWith(engineLoadProgressChanged(snapshot));
  });
});
