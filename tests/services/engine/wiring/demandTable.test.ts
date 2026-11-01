/**
 * demandTable — data-driven regression net for `reevaluateDemand`.
 *
 * Drives `reevaluateDemand(state)` against the REAL composed asset rows for representative engine
 * states and asserts the EXACT set of slot `load` spies that fired, so a moved predicate or broken row
 * fails here before it silently starves an asset. `buildDemandCtx` reads `state.settings` (incl.
 * `galaxyCatalogs.items[id].enabled`, `cosmicWebDensity.items[id].enabled`), `state.tier`, `state.ui`
 * (`paletteOpen` triggers pgcAlias) and `state.slotsByKey`; the rest is `as unknown as` cast.
 * famousGalaxiesMeta needs a two-phase boot, reproduced by `stubSlot` (see there). mcpm boots enabled,
 * polyphorm-2mrs does not.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { reevaluateDemand } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { Source } from '../../../../src/data/source';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import { cosmicWebDensityAssetRows } from '../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityAssetRows';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { meshAssetRows } from '../../../../src/services/engine/wiring/meshAssetRows';
import { galaxyCatalogAssetRows } from '../../../../src/layers/galaxyCatalog/load/galaxyCatalogAssetRows';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import { structureAssetRows } from '../../../../src/layers/structure/load/structureAssetRows';
import type { StructureRuntime } from '../../../../src/layers/structure/@types/StructureRuntime';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';

type StubSlot = AssetSlot<unknown, unknown> & { load: ReturnType<typeof vi.fn> };

/** Stub slot whose `load` is a spy and whose `state()` kind is controllable. `load()` flips
 *  idle→'loading' like the real slot, so one pass models the two-phase boot (the Famous point row loads
 *  it under the idle-guard, then the famousGalaxiesMeta row sees it 'loading'); a stub frozen at either
 *  kind would starve one row. A non-idle `kind` (e.g. 'error') does not auto-transition. */
function stubSlot(kind: LoadState<unknown>['kind'] = 'idle'): StubSlot {
  let current = kind;
  const load = vi.fn(() => {
    if (current === 'idle') current = 'loading';
  });
  return {
    name: 'stub',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    committed: () => null,
    state: () => ({ kind: current }) as LoadState<unknown>,
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  };
}

type SettingsLeaves = {
  structures?: {
    enabled: boolean;
    items: Record<string, { enabled: boolean; labelEnabled: boolean }>;
  };
};

type VolumeFieldLeaves = EngineSettingsState['cosmicWebDensity']['items'];

/** Default-at-boot volume fields from `INITIAL_SETTINGS` (mcpm enabled, others disabled), so a drift
 *  in the real defaults fails here too. */
const BOOT_VOLUME_FIELDS: VolumeFieldLeaves = INITIAL_SETTINGS.cosmicWebDensity.items;

type GalaxyCatalogItemLeaves = Partial<Record<GalaxyCatalogId, { enabled: boolean }>>;

const BOOT_SETTINGS: SettingsLeaves = {
  structures: {
    enabled: true,
    items: {
      'galaxy-cluster': { enabled: true, labelEnabled: true },
      supercluster: { enabled: true, labelEnabled: true },
      void: { enabled: true, labelEnabled: true },
      'galaxy-group': { enabled: true, labelEnabled: true },
    },
  },
};

const BOOT_GALAXY_CATALOG_ITEMS: GalaxyCatalogItemLeaves = {
  sdss: { enabled: true },
  '2mrs': { enabled: true },
  glade: { enabled: true },
  famousGalaxy: { enabled: true },
  milliquas: { enabled: true },
  // DesiDeep/Wedge/Sgw boot hidden (specialist drill patches), so their point rows are NOT demanded at boot.
  desiDeep: { enabled: false },
  desiWedge: { enabled: false },
  desiSgw: { enabled: false },
};

type PointSlotOverrides = Partial<Record<SourceType, StubSlot>>;
type NamedSlotOverrides = Partial<{
  famousGalaxiesMeta: StubSlot;
  structureCatalog: StubSlot;
  pgcAlias: StubSlot;
}>;

type MakeStateOptions = {
  settings?: SettingsLeaves;
  galaxyCatalogItems?: GalaxyCatalogItemLeaves;
  volumeFields?: VolumeFieldLeaves;
  paletteOpen?: boolean;
  pointSlots?: PointSlotOverrides;
  namedSlots?: NamedSlotOverrides;
};

const ALL_POINT_SOURCES: readonly SourceType[] = [
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
  Source.Milliquas,
  Source.FamousGalaxy,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
];

function makeState(opts: MakeStateOptions = {}): EngineState {
  const {
    settings = BOOT_SETTINGS,
    galaxyCatalogItems = BOOT_GALAXY_CATALOG_ITEMS,
    volumeFields = BOOT_VOLUME_FIELDS,
    paletteOpen = false,
    pointSlots = {},
    namedSlots = {},
  } = opts;

  const points = new Map<SourceType, AssetSlot<unknown, unknown>>(
    ALL_POINT_SOURCES.map((src) => [
      src,
      (pointSlots[src] ?? stubSlot()) as AssetSlot<unknown, unknown>,
    ]),
  );
  const structureRuntime = {
    slot: namedSlots.structureCatalog ?? stubSlot(),
  } as unknown as StructureRuntime;
  const galaxyRuntime = {
    points,
    famousGalaxiesMeta: namedSlots.famousGalaxiesMeta ?? stubSlot(),
    pgcAlias: namedSlots.pgcAlias ?? stubSlot(),
    hiResFamous: stubSlot(),
  } as unknown as GalaxyCatalogRuntime;
  const densitySlots: Record<string, AssetSlot<unknown, unknown>> = {};
  for (const [, entry] of COSMIC_WEB_DENSITY_SOURCE_ROWS) {
    densitySlots[entry.id] = stubSlot() as AssetSlot<unknown, unknown>;
  }
  const densityRuntime = { slots: densitySlots } as unknown as CosmicWebDensityRuntime;

  const state = {
    tier: 'medium',
    settings: {
      ...(settings as unknown as EngineSettingsState),
      galaxyCatalogs: { items: galaxyCatalogItems },
      cosmicWebDensity: { items: volumeFields },
    } as unknown as EngineSettingsState,
    ui: { paletteOpen } as import('../../../../src/@types/ui/UiState').UiState,
    // Far from Earth — buildDemandCtx assembles the eye from pose + projection,
    // so both must be present; a far resting pose keeps the proximity-gated
    // body-texture rows out of the demand set.
    terrainHeightAt: datumOnlyTerrainHeight,
    cameraRuntime: {
      register: {
        pose: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
      },
      outputs: {
        displayed: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
        projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
        simDays: CONST_J2000,
        upBasis: ORIENTATION_FRAMES.ecliptic,
      },
    },
    // `evaluateRows` enqueues onto this rather than calling `slot.load()`
    // directly. Per state so no pending entry survives into the next case, and
    // at the production concurrency so `firedKeys` exercises the real bound.
    subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) },
    selection: { hover: null, select: null, focus: null },
  } as unknown as EngineState;
  // The composed lists `createLayers` would have written: core's mesh rows plus
  // the Layers', folded once, with every row's slot indexed by its key. The mesh
  // rows mint real slots; the far resting pose keeps them undemanded.
  state.assetRows = expandCompanionRows([
    ...meshAssetRows(state),
    ...galaxyCatalogAssetRows(galaxyRuntime),
    ...cosmicWebDensityAssetRows(densityRuntime),
    ...structureAssetRows(structureRuntime),
  ]);
  state.slotsByKey = new Map(state.assetRows.map((row) => [row.key, row.slot]));
  return state;
}

function collectFired(state: EngineState): Set<AssetKey> {
  const fired = new Set<AssetKey>();

  for (const [key, { load }] of state.slotsByKey) {
    if (vi.isMockFunction(load) && load.mock.calls.length) fired.add(key);
  }

  return fired;
}

/** Drive `reevaluateDemand(state)` to a fixpoint and report which rows fired. Drains the asset queue
 *  (it starts at most `ASSET_QUEUE_CONCURRENCY` fetchers per call, so one read would give a
 *  concurrency table) and re-runs until nothing new fires: famousGalaxiesMeta is satisfied only after
 *  the Famous row has STARTED, which the queue may defer past the enqueuing pass (production re-runs
 *  every frame). Terminates because spies never un-fire. */
async function firedKeys(state: EngineState): Promise<Set<AssetKey>> {
  let fired = new Set<AssetKey>();
  for (;;) {
    reevaluateDemand(state);
    await state.subsystems.assetQueue.drain();
    const next = collectFired(state);
    if (next.size === fired.size) return next;
    fired = next;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reevaluateDemand demand-table regression', () => {
  /** Boot defaults: SDSS/2MRS/GLADE/Famous/Milliquas enabled; DesiDeep/Wedge/Sgw not demanded. Famous is
   *  'loading' by the time famousGalaxiesMeta evaluates, so it is demanded; structureCatalog loads (every
   *  category visible); mcpm demanded (boots true), polyphorm-2mrs not; pgcAlias not (palette closed);
   *  `hiResFamous` demands unconditionally (its fetch is a GPU allocation). */
  it('boot defaults: SDSS + 2MRS + GLADE + Famous + Milliquas + famousGalaxiesMeta + hiResFamous + structureCatalog + mcpm (DesiDeep + DesiWedge + DesiSgw off)', async () => {
    const state = makeState();

    const fired = await firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousGalaxiesMeta',
        'hiResFamous',
        'structureCatalog',
        Source.Mcpm,
      ]),
    );
  });

  /** Structures all hidden (every ring AND label false): structureCatalog must NOT appear; Famous still
   *  loads and famousGalaxiesMeta follows. */
  it('structures all hidden: no structureCatalog (bug-fix pin)', async () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      structures: {
        enabled: true,
        items: {
          'galaxy-cluster': { enabled: false, labelEnabled: false },
          supercluster: { enabled: false, labelEnabled: false },
          void: { enabled: false, labelEnabled: false },
          'galaxy-group': { enabled: false, labelEnabled: false },
        },
      },
    };
    const state = makeState({ settings });

    const fired = await firedKeys(state);

    expect(fired.has('structureCatalog')).toBe(false);
    expect(fired.has(Source.SDSS)).toBe(true);
    expect(fired.has(Source.TwoMRS)).toBe(true);
    expect(fired.has(Source.Glade)).toBe(true);
    expect(fired.has(Source.FamousGalaxy)).toBe(true);
  });

  /** An all-failed boot: errored rows are still demanded but NOT idle, so the idle-guard skips them (no
   *  retry storm on re-eval). famousGalaxiesMeta still demands (Famous !== 'idle'). */
  it('errored galaxy catalogs are not retried on re-evaluation', async () => {
    const pointSlots: PointSlotOverrides = {
      [Source.SDSS]: stubSlot('error'),
      [Source.TwoMRS]: stubSlot('error'),
      [Source.Glade]: stubSlot('error'),
      [Source.Milliquas]: stubSlot('error'),
      [Source.FamousGalaxy]: stubSlot('error'),
    };
    const state = makeState({ pointSlots });

    const fired = await firedKeys(state);

    expect(fired.has('famousGalaxiesMeta')).toBe(true);
    expect(fired.has('structureCatalog')).toBe(true);
    expect(fired.has(Source.SDSS)).toBe(false);
    expect(fired.has(Source.TwoMRS)).toBe(false);
    expect(fired.has(Source.Glade)).toBe(false);
    expect(fired.has(Source.Milliquas)).toBe(false);
    expect(fired.has(Source.FamousGalaxy)).toBe(false);
  });

  /** Companion join in one pass: with ONLY Famous enabled, one `reevaluateDemand` loads BOTH the Famous
   *  point slot and famousGalaxiesMeta (the point row's load flips the stub to 'loading', which the later
   *  row reads). `setSourceVisible` relies on this ordering. */
  it('famous-only visible: one pass loads Famous + famousGalaxiesMeta together', async () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      structures: {
        enabled: true,
        items: {
          'galaxy-cluster': { enabled: false, labelEnabled: false },
          supercluster: { enabled: false, labelEnabled: false },
          void: { enabled: false, labelEnabled: false },
          'galaxy-group': { enabled: false, labelEnabled: false },
        },
      },
    };
    // Disable mcpm too so the fired set is exactly the join under test.
    const volumeFields: VolumeFieldLeaves = {
      ...BOOT_VOLUME_FIELDS,
      mcpm: { ...BOOT_VOLUME_FIELDS.mcpm, enabled: false },
    };
    const state = makeState({
      settings,
      volumeFields,
      galaxyCatalogItems: { famousGalaxy: { enabled: true } },
    });

    const fired = await firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([Source.FamousGalaxy, 'famousGalaxiesMeta', 'hiResFamous']),
    );
  });
});
