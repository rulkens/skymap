/**
 * installLoadProgress — unit tests for the load-progress registry + emitter
 * wiring extracted from wireSlots.
 *
 * Two invariants:
 *
 *   - `deps.allSlots` is populated from BOTH the point slots and the installed
 *     sidecar slots (+ the DEV synthetic record), keyed by `slot.name` — it is
 *     the single registry the loading bar AND the dev panel read from, so a
 *     missed slot makes the two views silently disagree;
 *   - `state.subsystems.loadProgress` is assigned the constructed emitter, and
 *     the emitter is built against that same `allSlots` Map instance.
 *
 * The emitter factory is mocked so we can capture the registry it receives
 * without touching `aggregateRegistry`'s projection — mirrors the spy style in
 * wireSlots.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { SourceType } from '../../../../src/@types/data/SourceType';

const emitterSpy = vi.fn();
const attachSpy = vi.fn();
vi.mock('../../../../src/services/engine/subsystems/loadProgressAggregator', () => ({
  createLoadProgressEmitter: vi.fn((_emit: unknown, slots: ReadonlyMap<string, unknown>) => {
    emitterSpy(slots);
    return { emit: vi.fn(), attachSlot: attachSpy, destroy: vi.fn() };
  }),
}));

import { installLoadProgress } from '../../../../src/services/engine/wiring/installLoadProgress';

function stubSlot(name: string): AssetSlot<unknown, unknown> {
  return {
    name,
    load: vi.fn(),
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  };
}

function makeState(): EngineState {
  const points = new Map<SourceType, AssetSlot<unknown, unknown>>([
    [Source.SDSS, stubSlot('sdss-points')],
    [Source.TwoMRS, stubSlot('2mrs-points')],
  ]);
  const starCatalogs = new Map<SourceType, AssetSlot<unknown, unknown>>([
    [Source.GaiaStars, stubSlot('starCatalog:gaiaStars')],
  ]);
  const bodyTextures = new Map<string, AssetSlot<unknown, unknown>>([
    ['earth', stubSlot('earth-texture')],
  ]);
  return {
    assetSlots: {
      points,
      starCatalogs,
      bodyTextures,
      filaments: stubSlot('filaments'),
      famousGalaxiesMeta: stubSlot('famous-galaxies-meta'),
      structureCatalog: stubSlot('structure-catalog'),
      pgcAlias: stubSlot('pgc-aliases'),
      cf4Density: stubSlot('cf4Density'),
      mcpm: stubSlot('mcpm'),
      flow: stubSlot('flow'),
      syntheticVolumes: {
        'debug-gaussian': stubSlot('syntheticVolume:debug-gaussian'),
      },
    },
    subsystems: { loadProgress: null },
  } as unknown as EngineState;
}

function makeDeps(): BootstrapDeps {
  return {
    canvas: {} as HTMLCanvasElement,
    cb: { store: { dispatch: vi.fn() } } as unknown as BootstrapDeps['cb'],
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
  };
}

describe('installLoadProgress', () => {
  beforeEach(() => {
    emitterSpy.mockClear();
    attachSpy.mockClear();
  });

  it('populates allSlots from point + sidecar + synthetic slots by name', () => {
    const state = makeState();
    const deps = makeDeps();

    installLoadProgress(state, deps);

    const names = new Set(deps.allSlots.keys());
    expect(names.has('sdss-points')).toBe(true);
    expect(names.has('2mrs-points')).toBe(true);
    // Star-catalog slots ride the same registry: without this, a committing
    // star catalog gets no loading-bar progress AND no slot-ready render wake
    // (installSlotReadyWake subscribes over this same Map).
    expect(names.has('starCatalog:gaiaStars')).toBe(true);
    // Body-texture family slots ride the same registry (gathered from the keyed
    // bodyTextures map, not a named field).
    expect(names.has('earth-texture')).toBe(true);
    expect(names.has('filaments')).toBe(true);
    expect(names.has('famous-galaxies-meta')).toBe(true);
    expect(names.has('structure-catalog')).toBe(true);
    expect(names.has('pgc-aliases')).toBe(true);
    expect(names.has('cf4Density')).toBe(true);
    expect(names.has('mcpm')).toBe(true);
    expect(names.has('flow')).toBe(true);
    expect(names.has('syntheticVolume:debug-gaussian')).toBe(true);
  });

  it('builds the emitter against the same allSlots Map and assigns loadProgress', () => {
    const state = makeState();
    const deps = makeDeps();

    installLoadProgress(state, deps);

    expect(emitterSpy).toHaveBeenCalledTimes(1);
    expect(emitterSpy.mock.calls[0]![0]).toBe(deps.allSlots);
    // Every registry slot was attached to the emitter.
    expect(attachSpy).toHaveBeenCalledTimes(deps.allSlots.size);
    expect(state.subsystems.loadProgress).not.toBeNull();
  });
});
