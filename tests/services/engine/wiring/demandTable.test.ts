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
 * `famousMeta.demand(ctx)` is true when `slotState(Famous) !== 'idle'`.
 * The Famous POINT slot is demanded whenever Famous is in the drawMask
 * (visible by default), so at the moment `reevaluateDemand` fires at boot
 * the Famous slot has just had `.load()` called on it — its `state()` returns
 * `'loading'`. We model the boot case this way: the Famous point slot's stub
 * `state()` returns `{ kind: 'loading' }`, which makes `slotState(Famous)
 * !== 'idle'` true, and famousMeta IS in the expected boot set.
 * This is the honest model: if you want to test "Famous slot still idle",
 * override it explicitly and exclude famousMeta (see the 'structures all
 * hidden' case, where Famous stays in the mask but slot state is left at
 * 'idle' by default to isolate the cluster predicate).
 *
 * ### MCPM at boot
 *
 * Although `SOURCE_REGISTRY[Source.Mcpm].visible` is `true`, the demand
 * predicate for `mcpm` reads `settings.volumes.fields[MCPM_FIELD]?.enabled`.
 * The `fields` record is empty (`{}`) at engine startup — no field is
 * registered until the GPU IIFE fires `addVolumeField`. So MCPM is NOT in
 * the boot demand set even though the source is "visible" in the registry.
 *
 * ### SURVEY_POINT_SOURCES (Synthetic fallback gate)
 *
 * `allSurveysSettledWithoutSuccess` iterates `SURVEY_POINT_SOURCES`:
 * SDSS, TwoMRS, Glade, Milliquas (the `category === 'survey'` rows).
 * Famous is category 'curated'; Synthetic is 'synthetic'. Both are excluded.
 * The 'all surveys errored' case must drive all four to 'error'.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { reevaluateDemand } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { Source } from '../../../../src/data/sources';
import { ALL_VISIBLE_MASK, maskWithout } from '../../../../src/utils/sourceMask';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';

// ── Stub slot factory ────────────────────────────────────────────────────────

type StubSlot = AssetSlot<unknown, unknown> & { load: ReturnType<typeof vi.fn> };

/**
 * Stub slot whose `load` is a vi.fn spy; `state()` returns a controllable
 * kind so `slotState` reads resolve correctly in demand predicates.
 */
function stubSlot(kind: LoadState<unknown>['kind'] = 'idle'): StubSlot {
  const load = vi.fn();
  return {
    name: 'stub',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    state: () => ({ kind } as LoadState<unknown>),
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
  volumes?: { masterEnabled?: boolean; fields: Record<string, { enabled: boolean }> };
  markerCategoryVisibility?: Record<string, boolean>;
  labelCategoryVisibility?: Record<string, boolean>;
};

/**
 * Default-at-boot settings: all structure categories visible, filaments off,
 * volumes fields empty (no registered cube yet), Synthetic fallback visible.
 *
 * These match the engine's real initial state as documented in
 * `data/defaults.ts` and `EngineSettingsState`.
 */
const BOOT_SETTINGS: SettingsLeaves = {
  filaments: { enabled: false },
  volumes: { fields: {} },
  markerCategoryVisibility: { cluster: true, supercluster: true, void: true, famousGalaxy: true },
  labelCategoryVisibility: { cluster: true, supercluster: true, void: true, famousGalaxy: true },
};

// ── Stub state builder ───────────────────────────────────────────────────────

type PointSlotOverrides = Partial<Record<SourceType, StubSlot>>;
type NamedSlotOverrides = Partial<{
  famousMeta: StubSlot;
  filaments: StubSlot;
  clusterCatalog: StubSlot;
  pgcAlias: StubSlot;
  cf4Density: StubSlot;
  mcpm: StubSlot;
}>;

type MakeStateOptions = {
  drawMask?: number;
  settings?: SettingsLeaves;
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
  Source.Famous,
  Source.Synthetic,
];

function makeState(opts: MakeStateOptions = {}): EngineState {
  const {
    drawMask = ALL_VISIBLE_MASK,
    settings = BOOT_SETTINGS,
    requests = new Set(),
    pointSlots = {},
    namedSlots = {},
  } = opts;

  // Build the points map: every source gets either the caller's override or a
  // fresh idle stub, so slotFor never returns undefined for a demanded key.
  const points = new Map<SourceType, AssetSlot<unknown, unknown>>(
    ALL_POINT_SOURCES.map((src) => [src, (pointSlots[src] ?? stubSlot()) as AssetSlot<unknown, unknown>]),
  );

  return {
    settings: settings as unknown as EngineSettingsState,
    sources: { drawMask, tier: 'medium' },
    requests: requests as Set<import('../../../../src/@types/loading/RequestKey').RequestKey>,
    assetSlots: {
      points,
      filaments: (namedSlots.filaments ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      famousMeta: (namedSlots.famousMeta ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
      clusterCatalog: (namedSlots.clusterCatalog ?? stubSlot()) as AssetSlot<unknown, unknown> as never,
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
function firedKeys(
  state: EngineState,
  pointSlots: PointSlotOverrides,
  namedSlots: NamedSlotOverrides,
): Set<AssetKey> {
  reevaluateDemand(state);

  const fired = new Set<AssetKey>();

  // Point slots — check each source we put in the map.
  for (const src of ALL_POINT_SOURCES) {
    const slot = (state.assetSlots.points.get(src) as StubSlot | undefined);
    if (slot?.load.mock.calls.length) fired.add(src);
  }

  // Named slots — check the ones that might have fired.
  const namedKeys = ['famousMeta', 'filaments', 'clusterCatalog', 'pgcAlias', 'cf4Density', 'mcpm'] as const;
  for (const key of namedKeys) {
    const slot = (state.assetSlots[key] as StubSlot | null | undefined);
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
   * Boot defaults: SDSS/2MRS/GLADE/Famous visible (Milliquas NOT — visible:false
   * in SOURCE_REGISTRY). Famous slot is modelled as 'loading' (it was just
   * triggered by its own demand row before famousMeta's row evaluates), so
   * famousMeta is also demanded. clusterCatalog loads because every structure
   * category is visible by default. mcpm is NOT demanded despite
   * SOURCE_REGISTRY[Mcpm].visible being true: the predicate checks
   * settings.volumes.fields[MCPM_FIELD]?.enabled, and fields is empty at boot.
   * filaments: off. cf4Density: off. pgcAlias: no request. Synthetic: surveys
   * not errored.
   */
  it('boot defaults: SDSS + 2MRS + GLADE + Famous + famousMeta + clusterCatalog', () => {
    // Famous slot is 'loading' — its point-row demand was already true (Famous
    // is in the drawMask), so its slot fired first and is now loading.
    const famousSlot = stubSlot('loading');
    const pointSlots: PointSlotOverrides = { [Source.Famous]: famousSlot };
    const namedSlots: NamedSlotOverrides = {};
    const state = makeState({ pointSlots, namedSlots });

    const fired = firedKeys(state, pointSlots, namedSlots);

    expect(fired).toEqual(new Set<AssetKey>([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Famous,
      'famousMeta',
      'clusterCatalog',
    ]));
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
    const famousSlot = stubSlot('loading');
    const pointSlots: PointSlotOverrides = { [Source.Famous]: famousSlot };
    const namedSlots: NamedSlotOverrides = {};
    const state = makeState({ settings, pointSlots, namedSlots });

    const fired = firedKeys(state, pointSlots, namedSlots);

    expect(fired).toEqual(new Set<AssetKey>([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Famous,
      'famousMeta',
      'clusterCatalog',
      'filaments',
    ]));
  });

  /**
   * Structures all hidden: every category set to false in BOTH
   * markerCategoryVisibility and labelCategoryVisibility.
   * Bug-fix pin: clusterCatalog must NOT appear. This verifies the
   * consolidated predicate rather than the stale 'structures.enabled' flag.
   *
   * Famous slot is modelled as idle here (isolating the cluster predicate;
   * famousMeta is therefore also excluded from the expected set).
   */
  it('structures all hidden: no clusterCatalog (bug-fix pin)', () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      markerCategoryVisibility: { cluster: false, supercluster: false, void: false, famousGalaxy: false },
      labelCategoryVisibility: { cluster: false, supercluster: false, void: false, famousGalaxy: false },
    };
    // Famous slot stays idle — tests only the cluster predicate.
    const state = makeState({ settings });

    const fired = firedKeys(state, {}, {});

    // clusterCatalog must be absent.
    expect(fired.has('clusterCatalog')).toBe(false);
    // famousMeta absent (Famous slot is idle).
    expect(fired.has('famousMeta')).toBe(false);
    // The three visible surveys are still demanded.
    expect(fired.has(Source.SDSS)).toBe(true);
    expect(fired.has(Source.TwoMRS)).toBe(true);
    expect(fired.has(Source.Glade)).toBe(true);
    expect(fired.has(Source.Famous)).toBe(true);
  });

  /**
   * Palette opened: adds the 'paletteOpened' request flag, which triggers
   * pgcAlias on top of the boot set. Famous slot 'loading' for famousMeta.
   */
  it('palette opened: boot set + pgcAlias', () => {
    const famousSlot = stubSlot('loading');
    const pointSlots: PointSlotOverrides = { [Source.Famous]: famousSlot };
    const namedSlots: NamedSlotOverrides = {};
    const state = makeState({
      requests: new Set(['paletteOpened']),
      pointSlots,
      namedSlots,
    });

    const fired = firedKeys(state, pointSlots, namedSlots);

    expect(fired).toEqual(new Set<AssetKey>([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Famous,
      'famousMeta',
      'clusterCatalog',
      'pgcAlias',
    ]));
  });

  /**
   * All real surveys errored: Synthetic fallback is demanded.
   * SURVEY_POINT_SOURCES = [SDSS, TwoMRS, Glade, Milliquas] (category 'survey').
   * All four slots must be 'error' for allSurveysSettledWithoutSuccess to fire.
   * Milliquas is NOT in the default drawMask (visible: false in SOURCE_REGISTRY)
   * so its point row's demand is false — only Synthetic gets triggered here
   * among the survey/synthetic rows. Famous (curated) and its slot states are
   * orthogonal.
   *
   * In this case Famous slot is also set to 'error' to reflect that it failed
   * too, but famousMeta will still be demanded because Famous slot !== 'idle'.
   * clusterCatalog is still demanded (structure categories still visible).
   */
  it('all real surveys errored: Synthetic demanded', () => {
    const pointSlots: PointSlotOverrides = {
      [Source.SDSS]: stubSlot('error'),
      [Source.TwoMRS]: stubSlot('error'),
      [Source.Glade]: stubSlot('error'),
      [Source.Milliquas]: stubSlot('error'),
      // Famous errored too — but it's curated, not a SURVEY_POINT_SOURCE.
      // famousMeta demands because Famous slot !== 'idle'.
      [Source.Famous]: stubSlot('error'),
    };
    const namedSlots: NamedSlotOverrides = {};
    const state = makeState({ pointSlots, namedSlots });

    const fired = firedKeys(state, pointSlots, namedSlots);

    // Synthetic fallback is now demanded.
    expect(fired.has(Source.Synthetic)).toBe(true);
    // famousMeta is demanded (Famous slot !== 'idle').
    expect(fired.has('famousMeta')).toBe(true);
    // clusterCatalog still demanded (structure visibility unchanged).
    expect(fired.has('clusterCatalog')).toBe(true);
    // The errored survey point rows: SDSS/2MRS/GLADE are still visible so
    // their point row demand is true — load is still called (idempotency is
    // the slot's problem, not the loop's).
    expect(fired.has(Source.SDSS)).toBe(true);
    expect(fired.has(Source.TwoMRS)).toBe(true);
    expect(fired.has(Source.Glade)).toBe(true);
    // Milliquas is NOT in drawMask (visible:false) — its point row demand=false.
    expect(fired.has(Source.Milliquas)).toBe(false);
    // Famous's point row is demanded (it IS in drawMask).
    expect(fired.has(Source.Famous)).toBe(true);
  });

  /**
   * cf4Density field enabled: adds cf4Density to the boot set.
   * Famous slot 'loading' for famousMeta.
   */
  it('cf4Density field enabled: boot set + cf4Density', () => {
    const settings: SettingsLeaves = {
      ...BOOT_SETTINGS,
      volumes: {
        fields: { 'cf4-density': { enabled: true } },
      },
    };
    const famousSlot = stubSlot('loading');
    const pointSlots: PointSlotOverrides = { [Source.Famous]: famousSlot };
    const namedSlots: NamedSlotOverrides = {};
    const state = makeState({ settings, pointSlots, namedSlots });

    const fired = firedKeys(state, pointSlots, namedSlots);

    expect(fired).toEqual(new Set<AssetKey>([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Famous,
      'famousMeta',
      'clusterCatalog',
      'cf4Density',
    ]));
  });
});
