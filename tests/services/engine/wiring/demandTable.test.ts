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
 *   - `state.settings`             — predicate leaf values
 *   - `state.sources.drawMask`     — `maskHas` per source
 *   - `state.sources.tier`         — passed to `req(tier)`
 *   - `state.requests`             — `Set<RequestKey>`
 *   - `state.assetSlots`           — `slotFor` dispatch target
 *
 * All other `EngineState` fields are irrelevant to the demand loop; they
 * are `as unknown as` cast so tests don't need a fully-constructed engine.
 *
 * ### famousMeta boot-case modelling
 *
 * `famousMeta.demand(ctx)` is true when `slotState(Famous) !== 'idle'`. At boot
 * the Famous POINT row evaluates first (Famous is in the drawMask), finds the
 * slot idle, and loads it; the loop's idle-guard then leaves it alone, but the
 * stub's `load()` flips its reported kind idle → 'loading'. The later
 * famousMeta row sees `slotState(Famous) === 'loading'` and demands. The stub
 * auto-transition (see `stubSlot`) reproduces this two-phase truth in a single
 * `reevaluateDemand` pass — a stub frozen at one kind could only satisfy one of
 * the two rows under the idle-guard.
 *
 * ### MCPM at boot
 *
 * The demand predicate for `mcpm` reads `ctx.volumeField('mcpm')?.enabled`,
 * sourced from `state.settings.volumes.items`. The engine seeds that record
 * at construction from the shippable volume registry entries (`seedVolumeFields`),
 * so `mcpm`'s enabled bit is `true` (registry visible:true) at boot, symmetric
 * with how `drawMask` seeds survey visibility. MCPM therefore IS in the boot
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
 * the loop's idle-guard lets it load when armed; the errored survey slots that
 * triggered the fallback stay non-idle and are deliberately NOT re-loaded.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { reevaluateDemand } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { Source } from '../../../../src/data/sources';
import { ALL_VISIBLE_MASK } from '../../../../src/utils/sourceMask';
import { seedVolumeFields } from '../../../../src/data/volumeFieldDefaults';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { VolumeFieldId } from '../../../../src/@types/data/VolumeFieldId';
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
 * and loads it (under the loop's idle-guard), then the later famousMeta row
 * sees the now-'loading' Famous slot and demands. A stub frozen at 'loading'
 * would suppress the point row's load under the idle-guard; a stub frozen at
 * 'idle' would suppress famousMeta. The transition models reality and resolves
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
    forceReload: () => {},
    cancel: () => {},
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
  markerCategoryVisibility?: Record<string, boolean>;
  labelCategoryVisibility?: Record<string, boolean>;
};

/**
 * Volume-field params keyed by id. Demand predicates read these from
 * `state.settings.volumes.items` (`ctx.volumeField(id)?.enabled`), so
 * `makeState` injects this record directly into the settings bag.
 */
type VolumeFieldLeaves = Partial<Record<VolumeFieldId, { enabled: boolean }>>;

/**
 * Default-at-boot settings: all structure categories visible, filaments off,
 * Synthetic fallback visible.
 *
 * These match the engine's real initial state as documented in
 * `data/defaults.ts` and `EngineSettingsState`.
 */
const BOOT_SETTINGS: SettingsLeaves = {
  filaments: { enabled: false },
  markerCategoryVisibility: {
    cluster: true,
    supercluster: true,
    void: true,
    famousGalaxy: true,
    group: true,
  },
  labelCategoryVisibility: {
    cluster: true,
    supercluster: true,
    void: true,
    famousGalaxy: true,
    group: true,
  },
};

/**
 * Default-at-boot volume fields: seeded from the shippable volume registry via
 * the same `seedVolumeFields` the engine runs at construction (mcpm enabled,
 * cf4-density disabled).
 */
const BOOT_VOLUME_FIELDS: VolumeFieldLeaves = seedVolumeFields();

// ── Stub state builder ───────────────────────────────────────────────────────

type PointSlotOverrides = Partial<Record<SourceType, StubSlot>>;
type NamedSlotOverrides = Partial<{
  famousMeta: StubSlot;
  filaments: StubSlot;
  structureCatalog: StubSlot;
  pgcAlias: StubSlot;
  cf4Density: StubSlot;
  mcpm: StubSlot;
}>;

type MakeStateOptions = {
  drawMask?: number;
  settings?: SettingsLeaves;
  /** Volume-field params; injected into `settings.volumes.items`. Defaults to boot. */
  volumeFields?: VolumeFieldLeaves;
  requests?: Set<string>;
  /** Per-source point slots. Defaults to a fresh idle stub for every Source. */
  pointSlots?: PointSlotOverrides;
  /** Named asset slots. Each defaults to a fresh idle stub. */
  namedSlots?: NamedSlotOverrides;
};

/**
 * All source codes that appear in ASSET_WIRING as point rows — surveys +
 * Synthetic. Ensures every expected-key slot is reachable via `slotFor`.
 */
const ALL_POINT_SOURCES: readonly SourceType[] = [
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
  Source.Milliquas,
  Source.FamousGalaxy,
  Source.Synthetic,
];

function makeState(opts: MakeStateOptions = {}): EngineState {
  const {
    drawMask = ALL_VISIBLE_MASK,
    settings = BOOT_SETTINGS,
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
    // Inject volume fields directly into `settings.volumes.items` — demand
    // predicates read `ctx.volumeField(id)?.enabled` from that path via
    // `state.settings.volumes.items`.
    settings: {
      ...(settings as unknown as EngineSettingsState),
      volumes: { items: volumeFields },
    } as unknown as EngineSettingsState,
    sources: { drawMask, tier: 'medium' },
    requests: requests as Set<import('../../../../src/@types/loading/RequestKey').RequestKey>,
    assetSlots: {
      points,
      filaments: (namedSlots.filaments ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      famousMeta: (namedSlots.famousMeta ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      structureCatalog: (namedSlots.structureCatalog ?? stubSlot()) as AssetSlot<
        unknown,
        unknown
      > as never,
      pgcAlias: (namedSlots.pgcAlias ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      cf4Density: (namedSlots.cf4Density ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      mcpm: (namedSlots.mcpm ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
    },
  } as unknown as EngineState;
}

// ── Key → spy collector ──────────────────────────────────────────────────────

/**
 * Run `reevaluateDemand(state)`, then collect the set of `AssetKey`s whose
 * `load` spy fired at least once.
 *
 * The mapping from spy to key is built from the same stub objects inserted
 * into `state.assetSlots` — we inspect `load.mock.calls.length > 0` for each.
 */
function firedKeys(state: EngineState): Set<AssetKey> {
  reevaluateDemand(state);

  const fired = new Set<AssetKey>();

  // Point slots — check each source we put in the map.
  for (const src of ALL_POINT_SOURCES) {
    const slot = state.assetSlots.points.get(src) as StubSlot | undefined;
    if (slot?.load.mock.calls.length) fired.add(src);
  }

  // Named slots — check the ones that might have fired.
  const namedKeys = [
    'famousMeta',
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

// ── Test cases ───────────────────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reevaluateDemand demand-table regression', () => {
  /**
   * Boot defaults: SDSS/2MRS/GLADE/Famous/Milliquas all visible (every survey
   * ships on in SOURCE_REGISTRY). Famous slot is modelled as 'loading' (it was
   * just triggered by its own demand row before famousMeta's row evaluates), so
   * famousMeta is also demanded. structureCatalog loads because every structure
   * category is visible by default. mcpm IS demanded: the predicate checks
   * `ctx.volumeField('mcpm')?.enabled`, which the construction seed lands as
   * true (registry visible:true). cf4Density is NOT (seeded enabled:false).
   * filaments: off. pgcAlias: no request. Synthetic: surveys not errored.
   */
  it('boot defaults: SDSS + 2MRS + GLADE + Famous + Milliquas + famousMeta + structureCatalog + mcpm', () => {
    // Famous starts idle: its point row loads it (idle-guard passes), flipping
    // the stub to 'loading', so the later famousMeta row sees Famous non-idle
    // and demands. This is the honest two-phase boot model.
    const state = makeState();

    const fired = firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousMeta',
        'structureCatalog',
        'mcpm',
      ]),
    );
  });

  /**
   * Filaments enabled: boot defaults + filaments.enabled = true.
   * Adds 'filaments' to the expected set.
   */
  it('filaments enabled: boot set + filaments', () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      filaments: { enabled: true },
    };
    const state = makeState({ settings });

    const fired = firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousMeta',
        'structureCatalog',
        'mcpm',
        'filaments',
      ]),
    );
  });

  /**
   * Structures all hidden: every category set to false in BOTH
   * markerCategoryVisibility and labelCategoryVisibility.
   * Bug-fix pin: structureCatalog must NOT appear. This verifies the
   * consolidated predicate rather than the stale 'structures.enabled' flag.
   *
   * Famous starts idle and is in the drawMask, so its point row loads it and
   * famousMeta follows (the two-phase boot). The pin under test is the cluster
   * predicate, asserted independently below.
   */
  it('structures all hidden: no structureCatalog (bug-fix pin)', () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      markerCategoryVisibility: {
        cluster: false,
        supercluster: false,
        void: false,
        famousGalaxy: false,
      },
      labelCategoryVisibility: {
        cluster: false,
        supercluster: false,
        void: false,
        famousGalaxy: false,
      },
    };
    const state = makeState({ settings });

    const fired = firedKeys(state);

    // structureCatalog must be absent.
    expect(fired.has('structureCatalog')).toBe(false);
    // The three visible surveys are still demanded.
    expect(fired.has(Source.SDSS)).toBe(true);
    expect(fired.has(Source.TwoMRS)).toBe(true);
    expect(fired.has(Source.Glade)).toBe(true);
    expect(fired.has(Source.FamousGalaxy)).toBe(true);
  });

  /**
   * Palette opened: adds the 'paletteOpened' request flag, which triggers
   * pgcAlias on top of the boot set. Famous slot 'loading' for famousMeta.
   */
  it('palette opened: boot set + pgcAlias', () => {
    const state = makeState({
      requests: new Set(['paletteOpened']),
    });

    const fired = firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousMeta',
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
   * The survey slots are driven to 'error' to mirror a realistic all-failed
   * boot. Synthetic starts idle (never loaded), so the idle-guard lets it load
   * when armed — exactly the recovery path. The errored survey rows, by
   * contrast, are NOT re-loaded: the idle-guard skips non-idle slots, which is
   * the desired no-retry-storm behaviour (a re-eval must not abort + re-fetch
   * failed surveys). famousMeta still demands because Famous slot !== 'idle';
   * structureCatalog is still demanded (categories visible).
   */
  it('synthetic fallback armed: Synthetic loads, errored surveys are not retried', () => {
    const pointSlots: PointSlotOverrides = {
      [Source.SDSS]: stubSlot('error'),
      [Source.TwoMRS]: stubSlot('error'),
      [Source.Glade]: stubSlot('error'),
      [Source.Milliquas]: stubSlot('error'),
      // Famous errored too — but it's curated, not a SURVEY_POINT_SOURCE.
      // famousMeta demands because Famous slot !== 'idle'.
      [Source.FamousGalaxy]: stubSlot('error'),
    };
    const namedSlots: NamedSlotOverrides = {};
    const state = makeState({ requests: new Set(['syntheticFallback']), pointSlots, namedSlots });

    const fired = firedKeys(state);

    // Synthetic fallback is demanded AND idle → it loads (the recovery path).
    expect(fired.has(Source.Synthetic)).toBe(true);
    // famousMeta is demanded (Famous slot !== 'idle').
    expect(fired.has('famousMeta')).toBe(true);
    // structureCatalog still demanded (structure visibility unchanged).
    expect(fired.has('structureCatalog')).toBe(true);
    // The errored survey point rows are demanded (still visible) but NOT idle,
    // so the idle-guard leaves them alone — no retry storm on re-evaluation.
    expect(fired.has(Source.SDSS)).toBe(false);
    expect(fired.has(Source.TwoMRS)).toBe(false);
    expect(fired.has(Source.Glade)).toBe(false);
    // Milliquas is visible (in drawMask) but errored (non-idle) like the other
    // surveys, so the idle-guard skips it too — no retry storm.
    expect(fired.has(Source.Milliquas)).toBe(false);
    // Famous's point row is demanded but errored (non-idle) — not re-loaded.
    expect(fired.has(Source.FamousGalaxy)).toBe(false);
  });

  /**
   * cf4Density field enabled: user toggled cf4-density on, so it joins the
   * boot set (which already includes mcpm). Spreads the seeded fields and
   * flips cf4-density's enabled bit rather than replacing the record, so
   * mcpm's default-on bit survives. Famous slot 'loading' for famousMeta.
   */
  it('cf4Density field enabled: boot set + cf4Density', () => {
    const volumeFields: VolumeFieldLeaves = {
      ...BOOT_VOLUME_FIELDS,
      'cf4-density': { enabled: true },
    };
    const state = makeState({ volumeFields });

    const fired = firedKeys(state);

    expect(fired).toEqual(
      new Set<AssetKey>([
        Source.SDSS,
        Source.TwoMRS,
        Source.Glade,
        Source.FamousGalaxy,
        Source.Milliquas,
        'famousMeta',
        'structureCatalog',
        'mcpm',
        'cf4Density',
      ]),
    );
  });

  /**
   * Companion join in a single pass: when ONLY Famous is visible (its
   * drawMask bit set, all other categories hidden), one `reevaluateDemand`
   * loads BOTH the Famous point slot AND famousMeta. The Famous point row
   * evaluates first, finds the slot idle, and loads it — which synchronously
   * flips the stub to 'loading' (mirroring the real slot's load-started
   * dispatch). The later famousMeta row then reads `slotState(Famous) ===
   * 'loading'` and demands. This pins the ordering fact `setSourceVisible`
   * relies on: toggling Famous visible fetches both in the same pass.
   */
  it('famous-only visible: one pass loads Famous + famousMeta together', () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      // Hide every structure category so structureCatalog stays out of the set
      // and the assertion is purely the Famous companion join.
      markerCategoryVisibility: {
        cluster: false,
        supercluster: false,
        void: false,
        famousGalaxy: false,
      },
      labelCategoryVisibility: {
        cluster: false,
        supercluster: false,
        void: false,
        famousGalaxy: false,
      },
    };
    // Disable mcpm too so the fired set is exactly the join under test.
    const volumeFields: VolumeFieldLeaves = { ...BOOT_VOLUME_FIELDS, mcpm: { enabled: false } };
    const state = makeState({ settings, volumeFields, drawMask: 1 << Source.FamousGalaxy });

    const fired = firedKeys(state);

    expect(fired).toEqual(new Set<AssetKey>([Source.FamousGalaxy, 'famousMeta']));
  });
});
