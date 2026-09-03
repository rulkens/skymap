/**
 * demandTable — data-driven regression net for `reevaluateDemand`.
 *
 * The scattered-trigger consolidation (Task 10) puts every asset's load policy
 * in `ASSET_WIRING`. This file is the regression net: one test that drives
 * `reevaluateDemand(state)` against the REAL registry for representative
 * engine states, then asserts the EXACT set of slot `load` spies that fired.
 * A future edit that moves a predicate or breaks a row lands here as a
 * failing test before it silently starves an asset of its load trigger.
 *
 * ### Stub-state shape
 *
 * `buildDemandCtx(state)` reads:
 *   - `state.settings`             — predicate leaf values, including each
 *                                    galaxy catalog's `galaxyCatalogs.items[id].enabled`
 *                                    (the intent bit galaxy catalog demand reads)
 *   - `state.tier`                 — passed to `req(tier)` by `reevaluateDemand`
 *   - `state.requests`             — `Set<RequestKey>`
 *   - `state.assetSlots`           — `slotFor` dispatch target
 *
 * All other `EngineState` fields are irrelevant to the demand loop; they
 * are `as unknown as` cast so tests don't need a fully-constructed engine.
 *
 * ### famousGalaxiesMeta boot-case modelling
 *
 * `famousGalaxiesMeta.demand(ctx)` is true when `slotState(Famous) !== 'idle'`. At boot
 * the Famous POINT row evaluates first (Famous is enabled), finds the
 * slot idle, and loads it; the loop's idle-guard then leaves it alone, but the
 * stub's `load()` flips its reported kind idle → 'loading'. The later
 * famousGalaxiesMeta row sees `slotState(Famous) === 'loading'` and demands. The stub
 * auto-transition (see `stubSlot`) reproduces this two-phase truth in a single
 * `reevaluateDemand` pass — a stub frozen at one kind could only satisfy one of
 * the two rows under the idle-guard.
 *
 * ### MCPM at boot
 *
 * The demand predicate for `mcpm` reads
 * `ctx.settings.volumes.items.mcpm?.enabled`. The engine seeds that record
 * at construction from the shippable volume registry entries (`seedVolumeFields`),
 * so `mcpm`'s enabled bit is `true` (registry visible:true) at boot — symmetric
 * with the `galaxyCatalogs.items[id].enabled` seed that galaxy catalog demand reads.
 * MCPM therefore IS in the boot
 * demand set — `cf4-density` is NOT (registry visible:false → seeded
 * enabled:false). `makeState` injects the same `seedVolumeFields` record into
 * `settings.volumes.items` so the test exercises the real defaults rather than
 * a hand-rolled set.
 *
 * ### Synthetic fallback gate
 *
 * The Synthetic row's demand is a plain `ctx.request('syntheticFallback')`
 * read. The precise gate (count-aware, hidden-at-boot-aware) lives in
 * `createSyntheticFallback` and trips that flag; this regression net only
 * models the armed state by seeding the request set. Synthetic starts idle, so
 * the loop's idle-guard lets it load when armed; the errored galaxy catalog slots that
 * triggered the fallback stay non-idle and are deliberately NOT re-loaded.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { reevaluateDemand } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { Source } from '../../../../src/data/sources';
import { seedVolumeFields } from '../../../../src/data/volume/volumeFieldDefaults';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { VolumeFieldId } from '../../../../src/@types/data/volume/VolumeFieldId';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';

// ── Stub slot factory ────────────────────────────────────────────────────────

type StubSlot = AssetSlot<unknown, unknown> & { load: ReturnType<typeof vi.fn> };

/**
 * Stub slot whose `load` is a vi.fn spy; `state()` returns a controllable
 * kind so `slotState` reads resolve correctly in demand predicates.
 *
 * Calling `load()` flips the reported kind from 'idle' to 'loading' — the same
 * transition the real slot makes. This is what lets a single `reevaluateDemand`
 * pass model the two-phase boot truth: the Famous point row sees an idle slot
 * and loads it (under the loop's idle-guard), then the later famousGalaxiesMeta row
 * sees the now-'loading' Famous slot and demands. A stub frozen at 'loading'
 * would suppress the point row's load under the idle-guard; a stub frozen at
 * 'idle' would suppress famousGalaxiesMeta. The transition models reality and resolves
 * both.
 *
 * Pass a non-idle `kind` (e.g. 'error') to pin a slot that was NOT freshly
 * loaded this pass — those don't auto-transition (already past idle).
 */
function stubSlot(kind: LoadState<unknown>['kind'] = 'idle'): StubSlot {
  let current = kind;
  const load = vi.fn(() => {
    if (current === 'idle') current = 'loading';
  });
  return {
    name: 'stub',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    state: () => ({ kind: current }) as LoadState<unknown>,
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  };
}

// ── Realistic settings stubs ─────────────────────────────────────────────────

/**
 * The subset of EngineSettingsState that demand predicates read. Constructed
 * as a partial and cast through `unknown` — predicates only touch the leaves
 * they declare, so the full ~12-field bag is unnecessary in tests.
 */
type SettingsLeaves = {
  filaments?: { enabled: boolean };
  structures?: {
    enabled: boolean;
    items: Record<string, { enabled: boolean; labelEnabled: boolean }>;
  };
};

/**
 * Volume-field params keyed by id. Demand predicates read
 * `ctx.settings.volumes.items[id]?.enabled`, so `makeState` injects this
 * record directly into the settings bag.
 */
type VolumeFieldLeaves = Partial<Record<VolumeFieldId, { enabled: boolean }>>;

/**
 * Per-galaxy catalog visibility keyed by galaxy catalog id. Galaxy catalog demand reads
 * `ctx.settings.galaxyCatalogs.items[id]?.enabled` — intent, the same field
 * `setSourceVisible` writes — so `makeState` injects this record into
 * `settings.galaxyCatalogs.items`. An absent row reads as not enabled.
 */
type GalaxyCatalogItemLeaves = Partial<Record<GalaxyCatalogId, { enabled: boolean }>>;

/**
 * Default-at-boot settings: all structure categories visible, filaments off,
 * Synthetic fallback visible.
 *
 * These match the engine's real initial state as documented in
 * `data/defaults.ts` and `EngineSettingsState`.
 */
const BOOT_SETTINGS: SettingsLeaves = {
  filaments: { enabled: false },
  structures: {
    enabled: true,
    items: {
      cluster: { enabled: true, labelEnabled: true },
      supercluster: { enabled: true, labelEnabled: true },
      void: { enabled: true, labelEnabled: true },
      group: { enabled: true, labelEnabled: true },
    },
  },
};

/**
 * Default-at-boot volume fields: seeded from the shippable volume registry via
 * the same `seedVolumeFields` the engine runs at construction (mcpm enabled,
 * cf4-density disabled).
 */
const BOOT_VOLUME_FIELDS: VolumeFieldLeaves = seedVolumeFields();

/**
 * Default-at-boot galaxy catalog items, matching the engine's construction
 * seed: each row's `enabled` comes from its SOURCE_REGISTRY entry's `visible`
 * field — true for every galaxy catalog except the DESI patches
 * (DesiDeep / DesiWedge / DesiSgw).
 */
const BOOT_GALAXY_CATALOG_ITEMS: GalaxyCatalogItemLeaves = {
  synthetic: { enabled: true },
  sdss: { enabled: true },
  '2mrs': { enabled: true },
  glade: { enabled: true },
  famousGalaxy: { enabled: true },
  milliquas: { enabled: true },
  // DesiDeep + DesiWedge + DesiSgw boot hidden (SOURCE_REGISTRY
  // visible:false — specialist DESI drill patches, not part of the default
  // all-sky scene), so the construction seed lands their enabled bits false and
  // their ASSET_WIRING point rows are NOT demanded at boot. Symmetric with
  // cf4-density among the volume fields: registry visible:false → seeded
  // enabled:false → absent from the boot set.
  desiDeep: { enabled: false },
  desiWedge: { enabled: false },
  desiSgw: { enabled: false },
};

// ── Stub state builder ───────────────────────────────────────────────────────

type PointSlotOverrides = Partial<Record<SourceType, StubSlot>>;
type NamedSlotOverrides = Partial<{
  famousGalaxiesMeta: StubSlot;
  filaments: StubSlot;
  structureCatalog: StubSlot;
  pgcAlias: StubSlot;
  cf4Density: StubSlot;
  mcpm: StubSlot;
}>;

type MakeStateOptions = {
  settings?: SettingsLeaves;
  /** Per-galaxy catalog enabled bits; injected into `settings.galaxyCatalogs.items`. Defaults to boot (registry `visible` seed). */
  galaxyCatalogItems?: GalaxyCatalogItemLeaves;
  /** Volume-field params; injected into `settings.volumes.items`. Defaults to boot. */
  volumeFields?: VolumeFieldLeaves;
  requests?: Set<string>;
  /** Per-source point slots. Defaults to a fresh idle stub for every Source. */
  pointSlots?: PointSlotOverrides;
  /** Named asset slots. Each defaults to a fresh idle stub. */
  namedSlots?: NamedSlotOverrides;
};

/**
 * All source codes that appear in ASSET_WIRING as point rows — galaxy catalogs +
 * Synthetic. Ensures every expected-key slot is reachable via `slotFor`.
 */
const ALL_POINT_SOURCES: readonly SourceType[] = [
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
  Source.Milliquas,
  Source.FamousGalaxy,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
  Source.Synthetic,
];

function makeState(opts: MakeStateOptions = {}): EngineState {
  const {
    settings = BOOT_SETTINGS,
    galaxyCatalogItems = BOOT_GALAXY_CATALOG_ITEMS,
    volumeFields = BOOT_VOLUME_FIELDS,
    requests = new Set(),
    pointSlots = {},
    namedSlots = {},
  } = opts;

  // Build the points map: every source gets either the caller's override or a
  // fresh idle stub, so slotFor never returns undefined for a demanded key.
  const points = new Map<SourceType, AssetSlot<unknown, unknown>>(
    ALL_POINT_SOURCES.map((src) => [
      src,
      (pointSlots[src] ?? stubSlot()) as AssetSlot<unknown, unknown>,
    ]),
  );

  return {
    // tier feeds `req(state.tier)`; it lives in its own root field on EngineState.
    tier: 'medium',
    // Inject galaxy catalog + volume items directly into the settings bag — demand
    // predicates read `ctx.settings.galaxyCatalogs.items[id]?.enabled` and
    // `ctx.settings.volumes.items[id]?.enabled` from there.
    settings: {
      ...(settings as unknown as EngineSettingsState),
      galaxyCatalogs: { items: galaxyCatalogItems },
      volumes: { items: volumeFields },
    } as unknown as EngineSettingsState,
    requests: requests as Set<import('../../../../src/@types/loading/RequestKey').RequestKey>,
    // Far from Earth — buildDemandCtx assembles the eye from pose + projection,
    // so both must be present; a far resting pose keeps the proximity-gated
    // body-texture rows out of the demand set.
    cameraRuntime: {
      lastPose: {
        current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
      },
      displayedPose: {
        current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
      },
      projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
      lastRenderedSimDays: { current: CONST_J2000 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
    },
    assetSlots: {
      points,
      filaments: (namedSlots.filaments ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      famousGalaxiesMeta: (namedSlots.famousGalaxiesMeta ?? stubSlot()) as AssetSlot<
        unknown,
        unknown
      > as never,
      structureCatalog: (namedSlots.structureCatalog ?? stubSlot()) as AssetSlot<
        unknown,
        unknown
      > as never,
      pgcAlias: (namedSlots.pgcAlias ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      cf4Density: (namedSlots.cf4Density ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      mcpm: (namedSlots.mcpm ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      // Empty keyed family: the body-texture rows resolve to undefined slots
      // (far resting pose ⇒ none demanded anyway), so none fires.
      bodyTextures: new Map(),
    },
    // `evaluateRows` enqueues onto this rather than calling `slot.load()`
    // directly. Per state so no pending entry survives into the next case, and
    // at the production concurrency so `firedKeys` exercises the real bound.
    subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) },
  } as unknown as EngineState;
}

// ── Key → spy collector ──────────────────────────────────────────────────────

/**
 * The set of `AssetKey`s whose `load` spy has fired at least once. The mapping
 * from spy to key is built from the same stub objects inserted into
 * `state.assetSlots` — we inspect `load.mock.calls.length > 0` for each.
 */
function collectFired(state: EngineState): Set<AssetKey> {
  const fired = new Set<AssetKey>();

  // Point slots — check each source we put in the map.
  for (const src of ALL_POINT_SOURCES) {
    const slot = state.assetSlots.points.get(src) as StubSlot | undefined;
    if (slot?.load.mock.calls.length) fired.add(src);
  }

  // Named slots — check the ones that might have fired.
  const namedKeys = [
    'famousGalaxiesMeta',
    'filaments',
    'structureCatalog',
    'pgcAlias',
    'cf4Density',
    'mcpm',
  ] as const;
  for (const key of namedKeys) {
    const slot = state.assetSlots[key] as StubSlot | null | undefined;
    if (slot?.load.mock.calls.length) fired.add(key);
  }

  return fired;
}

/**
 * Drive `reevaluateDemand(state)` to a fixpoint and report which rows fired.
 *
 * Two things this has to do that a single synchronous call no longer does.
 *
 * **Drain.** `reevaluateDemand` doesn't call `slot.load()` itself any more; it
 * enqueues, and the queue starts at most `ASSET_QUEUE_CONCURRENCY` fetchers
 * before the call returns. Reading the spies straight after one call would
 * report only the first two rows and turn this demand table into a concurrency
 * table. The drain settles in microtasks because the stub `load` is synchronous.
 *
 * **Re-run.** `famousGalaxiesMeta`'s demand reads "the Famous slot is no longer idle",
 * so it is satisfied only after the Famous row has actually STARTED. The queue
 * defers that start past the pass that enqueued it whenever Famous is outranked
 * by two other demanded rows, which is the case at full boot. In production the
 * frame loop re-runs the whole evaluation every frame and picks it up on the
 * next one; here we re-run until nothing new fires, so the table keeps stating
 * the settled demand set rather than a one-pass snapshot.
 *
 * The loop terminates because spies never un-fire: the set only grows, and it
 * is bounded by the number of rows.
 */
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

// ── Test cases ───────────────────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reevaluateDemand demand-table regression', () => {
  /**
   * Boot defaults: SDSS/2MRS/GLADE/Famous/Milliquas all visible in
   * SOURCE_REGISTRY. DesiDeep + DesiWedge + DesiSgw are the galaxy catalogs with
   * visible:false, so their enabled bits seed false and their point rows are
   * NOT demanded at boot — symmetric with cf4-density among the volume fields.
   * Famous slot is modelled
   * as 'loading' (it was just triggered by its own demand row before
   * famousGalaxiesMeta's row evaluates), so famousGalaxiesMeta is also demanded. structureCatalog
   * loads because every structure category is visible by default. mcpm IS
   * demanded: the predicate checks `ctx.settings.volumes.items.mcpm?.enabled`,
   * which the construction seed lands as true (registry visible:true). cf4Density
   * is NOT (seeded enabled:false). filaments: off. pgcAlias: no request.
   * Synthetic: galaxy catalogs not errored.
   */
  it('boot defaults: SDSS + 2MRS + GLADE + Famous + Milliquas + famousGalaxiesMeta + structureCatalog + mcpm (DesiDeep + DesiWedge + DesiSgw off)', async () => {
    // Famous starts idle: its point row loads it (idle-guard passes), flipping
    // the stub to 'loading', so the later famousGalaxiesMeta row sees Famous non-idle
    // and demands. This is the honest two-phase boot model.
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
        'structureCatalog',
        'mcpm',
      ]),
    );
  });

  /**
   * Filaments enabled: boot defaults + filaments.enabled = true.
   * Adds 'filaments' to the expected set.
   */
  it('filaments enabled: boot set + filaments', async () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      filaments: { enabled: true },
    };
    const state = makeState({ settings });

    const fired = await firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousGalaxiesMeta',
        'structureCatalog',
        'mcpm',
        'filaments',
      ]),
    );
  });

  /**
   * Structures all hidden: every category's ring AND label set to false in
   * `structures.items`. Bug-fix pin: structureCatalog must NOT appear. This
   * verifies the consolidated predicate reading the per-category item rows.
   *
   * Famous starts idle and is enabled, so its point row loads it and
   * famousGalaxiesMeta follows (the two-phase boot). The pin under test is the cluster
   * predicate, asserted independently below.
   */
  it('structures all hidden: no structureCatalog (bug-fix pin)', async () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      structures: {
        enabled: true,
        items: {
          cluster: { enabled: false, labelEnabled: false },
          supercluster: { enabled: false, labelEnabled: false },
          void: { enabled: false, labelEnabled: false },
          group: { enabled: false, labelEnabled: false },
        },
      },
    };
    const state = makeState({ settings });

    const fired = await firedKeys(state);

    // structureCatalog must be absent.
    expect(fired.has('structureCatalog')).toBe(false);
    // The three visible galaxy catalogs are still demanded.
    expect(fired.has(Source.SDSS)).toBe(true);
    expect(fired.has(Source.TwoMRS)).toBe(true);
    expect(fired.has(Source.Glade)).toBe(true);
    expect(fired.has(Source.FamousGalaxy)).toBe(true);
  });

  /**
   * Palette opened: adds the 'paletteOpened' request flag, which triggers
   * pgcAlias on top of the boot set. Famous slot 'loading' for famousGalaxiesMeta.
   */
  it('palette opened: boot set + pgcAlias', async () => {
    const state = makeState({
      requests: new Set(['paletteOpened']),
    });

    const fired = await firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousGalaxiesMeta',
        'structureCatalog',
        'mcpm',
        'pgcAlias',
      ]),
    );
  });

  /**
   * Synthetic fallback armed: the `'syntheticFallback'` request flag is set
   * (the precise gate in createSyntheticFallback owns the decision to arm it;
   * here we just model the armed state), so the Synthetic row is demanded.
   *
   * The galaxy catalog slots are driven to 'error' to mirror a realistic all-failed
   * boot. Synthetic starts idle (never loaded), so the idle-guard lets it load
   * when armed — exactly the recovery path. The errored galaxy catalog rows, by
   * contrast, are NOT re-loaded: the idle-guard skips non-idle slots, which is
   * the desired no-retry-storm behaviour (a re-eval must not abort + re-fetch
   * failed galaxy catalogs). famousGalaxiesMeta still demands because Famous slot !== 'idle';
   * structureCatalog is still demanded (categories visible).
   */
  it('synthetic fallback armed: Synthetic loads, errored galaxy catalogs are not retried', async () => {
    const pointSlots: PointSlotOverrides = {
      [Source.SDSS]: stubSlot('error'),
      [Source.TwoMRS]: stubSlot('error'),
      [Source.Glade]: stubSlot('error'),
      [Source.Milliquas]: stubSlot('error'),
      // Famous errored too — but it's curated, not a GALAXY_CATALOG_POINT_SOURCE.
      // famousGalaxiesMeta demands because Famous slot !== 'idle'.
      [Source.FamousGalaxy]: stubSlot('error'),
    };
    const namedSlots: NamedSlotOverrides = {};
    const state = makeState({ requests: new Set(['syntheticFallback']), pointSlots, namedSlots });

    const fired = await firedKeys(state);

    // Synthetic fallback is demanded AND idle → it loads (the recovery path).
    expect(fired.has(Source.Synthetic)).toBe(true);
    // famousGalaxiesMeta is demanded (Famous slot !== 'idle').
    expect(fired.has('famousGalaxiesMeta')).toBe(true);
    // structureCatalog still demanded (structure visibility unchanged).
    expect(fired.has('structureCatalog')).toBe(true);
    // The errored galaxy catalog point rows are demanded (still visible) but NOT idle,
    // so the idle-guard leaves them alone — no retry storm on re-evaluation.
    expect(fired.has(Source.SDSS)).toBe(false);
    expect(fired.has(Source.TwoMRS)).toBe(false);
    expect(fired.has(Source.Glade)).toBe(false);
    // Milliquas is visible (enabled in settings) but errored (non-idle) like
    // the other galaxy catalogs, so the idle-guard skips it too — no retry storm.
    expect(fired.has(Source.Milliquas)).toBe(false);
    // Famous's point row is demanded but errored (non-idle) — not re-loaded.
    expect(fired.has(Source.FamousGalaxy)).toBe(false);
  });

  /**
   * cf4Density field enabled: user toggled cf4-density on, so it joins the
   * boot set (which already includes mcpm). Spreads the seeded fields and
   * flips cf4-density's enabled bit rather than replacing the record, so
   * mcpm's default-on bit survives. Famous slot 'loading' for famousGalaxiesMeta.
   */
  it('cf4Density field enabled: boot set + cf4Density', async () => {
    const volumeFields: VolumeFieldLeaves = {
      ...BOOT_VOLUME_FIELDS,
      'cf4-density': { enabled: true },
    };
    const state = makeState({ volumeFields });

    const fired = await firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousGalaxiesMeta',
        'structureCatalog',
        'mcpm',
        'cf4Density',
      ]),
    );
  });

  /**
   * Companion join in a single pass: when ONLY Famous is enabled (its
   * galaxy catalog items row set, all other galaxy catalogs + categories off), one
   * `reevaluateDemand` loads BOTH the Famous point slot AND famousGalaxiesMeta.
   * The Famous point row
   * evaluates first, finds the slot idle, and loads it — which synchronously
   * flips the stub to 'loading' (mirroring the real slot's load-started
   * dispatch). The later famousGalaxiesMeta row then reads `slotState(Famous) ===
   * 'loading'` and demands. This pins the ordering fact `setSourceVisible`
   * relies on: toggling Famous visible fetches both in the same pass.
   */
  it('famous-only visible: one pass loads Famous + famousGalaxiesMeta together', async () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      // Hide every structure category so structureCatalog stays out of the set
      // and the assertion is purely the Famous companion join.
      structures: {
        enabled: true,
        items: {
          cluster: { enabled: false, labelEnabled: false },
          supercluster: { enabled: false, labelEnabled: false },
          void: { enabled: false, labelEnabled: false },
          group: { enabled: false, labelEnabled: false },
        },
      },
    };
    // Disable mcpm too so the fired set is exactly the join under test.
    const volumeFields: VolumeFieldLeaves = { ...BOOT_VOLUME_FIELDS, mcpm: { enabled: false } };
    // Only Famous carries an enabled row — every other galaxy catalog is absent and
    // reads as not enabled.
    const state = makeState({
      settings,
      volumeFields,
      galaxyCatalogItems: { famousGalaxy: { enabled: true } },
    });

    const fired = await firedKeys(state);

    expect(fired).toEqual(new Set<AssetKey>([Source.FamousGalaxy, 'famousGalaxiesMeta']));
  });
});
