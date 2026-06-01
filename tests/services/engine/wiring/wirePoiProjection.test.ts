/**
 * wirePoiProjection — unit tests for the POI-group wiring extracted from
 * wireSlots.
 *
 * ### What this tests
 *
 * Four invariants:
 *
 *   1. Static anchors publish synchronously — no async arrival needed.
 *      After the call, `getPoisForCategory('cluster')` is non-empty.
 *
 *   2. The famous group requires BOTH the meta sidecar AND the Famous
 *      catalog.  Meta alone → no famous POIs.  Both present → famous
 *      POIs appear.  (The 2-asset join that prevents half-initialised
 *      famous labels.)
 *
 *   3. Out-of-order arrival: clusterBulk arriving first must not clobber
 *      the famous group when it later fires.  Keyed groups give this for
 *      free — each subscriber only writes its own key.
 *
 *   4. `onStructureCountsChange` fires after any group change with fresh
 *      per-category counts.
 *
 * ### Mocking strategy
 *
 * `buildStaticAnchorPois` is mocked to a deterministic minimal list so
 * tests don't depend on the curated JSON.  The POI subsystem is a real
 * `createPoiSubsystem()` instance so `getPoisForCategory` / `setGroup` /
 * `clearGroup` behave exactly as production code.  Asset slots are
 * light fake objects: a `subscribe` that stores its listener, a `fire`
 * helper to push a state transition, and nothing else.  This keeps the
 * tests fast and coupling-free from the real slot state machine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { ClusterCatalogPayload } from '../../../../src/@types/loading/ClusterCatalogPayload';

// ── Module mocks ───────────────────────────────────────────────────────
//
// Provide a deterministic seed list so tests don't couple to the curated
// JSON.  The real buildStaticAnchorPois parses an embedded JSON file and
// generates dozens of POIs; mocking it here keeps each test's expected
// count stable and import-time cheap.

vi.mock('../../../../src/data/buildStaticAnchorPois', () => ({
  buildStaticAnchorPois: vi.fn((): PointOfInterest[] => [
    {
      id: 'cluster-virgo',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0.016],
      physicalRadiusMpc: 2.2,
      featured: true,
    } as PointOfInterest,
    {
      id: 'supercluster-laniakea',
      name: 'Laniakea',
      category: 'supercluster',
      worldPos: [0, 0, 0.08],
      physicalRadiusMpc: 160,
      featured: true,
    } as PointOfInterest,
    {
      id: 'void-local',
      name: 'Local Void',
      category: 'void',
      worldPos: [0.05, 0, 0],
      physicalRadiusMpc: 45,
      featured: true,
    } as PointOfInterest,
  ]),
}));

// buildPoisFromFamousMeta: return one famous POI per meta entry when the
// catalog has matching positions.  Real implementation used in production;
// mocking here isolates the projection logic from the POI builder's internals.
vi.mock('../../../../src/services/engine/phases/buildPoisFromFamousMeta', () => ({
  buildPoisFromFamousMeta: vi.fn(
    (meta: Array<{ id: string; commonName?: string; names?: string[] }>): PointOfInterest[] =>
      meta.map((e) => ({
        id: `famous-${e.id}`,
        name: e.commonName ?? e.names?.[0] ?? e.id,
        category: 'famousGalaxy',
        worldPos: [0, 0, 0],
        featured: true,
        minApparentSizePx: 6,
        apparentDiameterKpc: 67,
        labelAnchorOffsetMpc: 0.05,
        labelWorldEmMpc: 0.02,
      })) as PointOfInterest[],
  ),
}));

// buildPoisFromClusterCatalog: return one POI per entry in catalog.meta.
vi.mock('../../../../src/services/engine/phases/buildPoisFromClusterCatalog', () => ({
  buildPoisFromClusterCatalog: vi.fn(
    (payload: ClusterCatalogPayload): PointOfInterest[] =>
      payload.meta.map((m) => ({
        id: `cluster-bulk-${m.id}`,
        name: m.names[0],
        category: 'cluster',
        worldPos: [0, 0, 0],
        physicalRadiusMpc: 2,
        featured: false,
      })) as PointOfInterest[],
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────
import { wirePoiProjection } from '../../../../src/services/engine/wiring/wirePoiProjection';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';

// ── Fake slot helper ───────────────────────────────────────────────────

/**
 * Minimal fake asset slot with a `fire` helper for driving state
 * transitions in tests.  Only the `subscribe` path is exercised by
 * wirePoiProjection; `load`, `cancel`, etc. are no-ops.  Backed by a Set so
 * a double-subscribe is observable rather than silently dropping the first
 * listener.
 */
type FakeSlot<V> = {
  subscribe: (fn: (s: LoadState<V>) => void) => () => void;
  fire: (s: LoadState<V>) => void;
};

function makeSlot<V>(): FakeSlot<V> {
  const listeners = new Set<(s: LoadState<V>) => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    fire(s) {
      for (const fn of listeners) fn(s);
    },
  };
}

/** A ready-state payload whose `value` satisfies the slot consumer's checks. */
function readyState<V>(value: V): LoadState<V> {
  return { kind: 'ready', req: {}, value, loadedAtMs: 0 };
}

// ── State builder ──────────────────────────────────────────────────────

type TestSlots = {
  famousMetaSlot: FakeSlot<{ meta: Array<{ id: string; commonName?: string }> }>;
  famousCatalogSlot: FakeSlot<GalaxyCatalog>;
  clusterCatalogSlot: FakeSlot<ClusterCatalogPayload>;
};

/**
 * Build a minimal EngineState with a real `poiSubsystem` and fake asset
 * slots for the three POI groups.  `state.sources.famousMeta` and
 * `state.sources.clusterBulk` start empty/null and are updated manually
 * in each test to mirror production (the slot subscribers write them in
 * the real engine, but here we control the timing explicitly).
 */
function makeState(): { state: EngineState; slots: TestSlots } {
  const famousMetaSlot = makeSlot<{ meta: Array<{ id: string; commonName?: string }> }>();
  const famousCatalogSlot = makeSlot<GalaxyCatalog>();
  const clusterCatalogSlot = makeSlot<ClusterCatalogPayload>();

  const points = new Map();
  points.set(Source.Famous, {
    name: 'famous-points',
    subscribe: famousCatalogSlot.subscribe,
    load: vi.fn(),
    state: () => ({ kind: 'idle' }),
    current: () => null,
    forceReload: vi.fn(),
    cancel: vi.fn(),
  });

  const state = {
    sources: {
      famousMeta: [] as ReturnType<typeof Array<{ id: string }>>,
      clusterBulk: null as ClusterCatalogPayload | null,
      catalogs: new Map(),
      drawMask: 0xff,
      pickMask: 0xff,
      tier: 'medium' as const,
    },
    assetSlots: {
      points,
      famousMeta: {
        name: 'famous-meta',
        subscribe: famousMetaSlot.subscribe,
        load: vi.fn(),
        state: () => ({ kind: 'idle' }),
        current: () => null,
        forceReload: vi.fn(),
        cancel: vi.fn(),
      },
      clusterCatalog: {
        name: 'cluster-catalog',
        subscribe: clusterCatalogSlot.subscribe,
        load: vi.fn(),
        state: () => ({ kind: 'idle' }),
        current: () => null,
        forceReload: vi.fn(),
        cancel: vi.fn(),
      },
      filaments: null,
      pgcAlias: null,
      cf4Density: null,
    },
    subsystems: {
      pois: createPoiSubsystem(),
    },
  } as unknown as EngineState;

  return {
    state,
    slots: { famousMetaSlot, famousCatalogSlot, clusterCatalogSlot },
  };
}

/** Build a minimal cb with a spy on onStructureCountsChange. */
function makeCb(): {
  cb: EngineCallbacks;
  countsSpy: ReturnType<typeof vi.fn>;
} {
  const countsSpy = vi.fn();
  const cb = {
    sources: {
      onStructureCountsChange: countsSpy,
    },
  } as unknown as EngineCallbacks;
  return { cb, countsSpy };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('wirePoiProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes static anchors synchronously', () => {
    // No slot fires, no await needed.  After wirePoiProjection returns, the
    // static anchors must already be in the subsystem so the Structures panel
    // can display cluster/supercluster/void counts from frame 1.
    const { state } = makeState();
    const { cb } = makeCb();

    wirePoiProjection(state, cb);

    const clusters = state.subsystems.pois.getPoisForCategory('cluster');
    const superclusters = state.subsystems.pois.getPoisForCategory('supercluster');
    const voids = state.subsystems.pois.getPoisForCategory('void');
    expect(clusters.length).toBeGreaterThan(0);
    expect(superclusters.length).toBeGreaterThan(0);
    expect(voids.length).toBeGreaterThan(0);
    // Famous galaxies must be absent until the 2-asset join fires.
    expect(state.subsystems.pois.getPoisForCategory('famousGalaxy').length).toBe(0);
  });

  it('famous group appears only when both Famous catalog and famousMeta are ready', () => {
    // The 2-asset join: meta alone is not enough.  Famous POIs must appear
    // only when the Famous catalog slot is also in the ready state.
    const { state, slots } = makeState();
    const { cb } = makeCb();

    wirePoiProjection(state, cb);

    // Phase 1 — meta arrives alone.  Famous catalog slot still idle.
    // wirePoiProjection reads state.sources.famousMeta on each transition,
    // so we write it before firing the slot.
    (state.sources as { famousMeta: unknown[] }).famousMeta = [
      { id: 'm31', commonName: 'Andromeda Galaxy' },
    ];
    slots.famousMetaSlot.fire(readyState({ meta: [] }));

    // No famous POIs yet — the Famous catalog slot hasn't fired.
    expect(state.subsystems.pois.getPoisForCategory('famousGalaxy').length).toBe(0);

    // Phase 2 — Famous catalog slot fires.  Now both conditions are met.
    const fakeCatalog = {
      count: 1,
      positions: new Float32Array([0.78, 0.1, 0.2]),
      diameterKpc: new Float32Array([67]),
    } as unknown as GalaxyCatalog;
    state.sources.catalogs.set(Source.Famous, fakeCatalog);
    slots.famousCatalogSlot.fire(readyState(fakeCatalog));

    // Famous POIs must now be present.
    const famousPois = state.subsystems.pois.getPoisForCategory('famousGalaxy');
    expect(famousPois.length).toBeGreaterThan(0);
    expect(famousPois.some((p) => p.id === 'famous-m31')).toBe(true);
  });

  it('clears the famous group and re-emits counts when famousMeta errors after the join', () => {
    // Symmetric with the cluster slot's error branch: a famousMeta error after
    // a completed join must clear the famous group and refresh the counts so
    // the Structures panel never shows a stale famous count.
    const { state, slots } = makeState();
    const { cb, countsSpy } = makeCb();

    wirePoiProjection(state, cb);

    // Land both assets so the famous group is populated.
    (state.sources as { famousMeta: unknown[] }).famousMeta = [
      { id: 'm31', commonName: 'Andromeda Galaxy' },
    ];
    const fakeCatalog = {
      count: 1,
      positions: new Float32Array([0.78, 0.1, 0.2]),
      diameterKpc: new Float32Array([67]),
      magnitudes: new Float32Array([3.4]),
    } as unknown as GalaxyCatalog;
    state.sources.catalogs.set(Source.Famous, fakeCatalog);
    slots.famousMetaSlot.fire(readyState({ meta: [] }));
    slots.famousCatalogSlot.fire(readyState(fakeCatalog));
    expect(state.subsystems.pois.getPoisForCategory('famousGalaxy').length).toBeGreaterThan(0);

    // famousMeta errors: the sidecar empties, the join condition fails, the
    // group clears, and counts re-emit.
    countsSpy.mockClear();
    (state.sources as { famousMeta: unknown[] }).famousMeta = [];
    slots.famousMetaSlot.fire({ kind: 'error', req: {}, error: new Error('fetch failed'), finalAttempt: 1 });
    expect(state.subsystems.pois.getPoisForCategory('famousGalaxy')).toHaveLength(0);
    expect(countsSpy).toHaveBeenCalled();
  });

  it('out-of-order arrival: clusterBulk before famous does not clobber famous', () => {
    // The bug the old merge worked around: a single setPois([...all]) would
    // overwrite whatever the previous call had placed, so clusterBulk
    // arriving second would clobber the already-merged famous group.
    // Keyed groups fix this — each subscriber only touches its own key.
    const { state, slots } = makeState();
    const { cb } = makeCb();

    wirePoiProjection(state, cb);

    // Step 1: clusterBulk arrives first.
    const clusterPayload: ClusterCatalogPayload = {
      catalog: {
        count: 1,
        positions: new Float32Array([1, 2, 3]),
        physicalRadiusMpc: new Float32Array([2]),
        apparentRadiusMpc: new Float32Array([4]),
        significance: new Float32Array([0.9]),
        category: new Uint8Array([0]),
      },
      meta: [{ id: 'coma', names: ['Coma Cluster'], abell: 'A1656', description: '' }],
    };
    (state.sources as { clusterBulk: unknown }).clusterBulk = clusterPayload;
    slots.clusterCatalogSlot.fire(readyState(clusterPayload));

    // clusterBulk POIs present.
    expect(state.subsystems.pois.findPoi('cluster-bulk-coma')).not.toBeNull();

    // Step 2: famous join fires.
    (state.sources as { famousMeta: unknown[] }).famousMeta = [
      { id: 'm31', commonName: 'Andromeda Galaxy' },
    ];
    const fakeCatalog = {
      count: 1,
      positions: new Float32Array([0.78, 0.1, 0.2]),
      diameterKpc: new Float32Array([67]),
    } as unknown as GalaxyCatalog;
    state.sources.catalogs.set(Source.Famous, fakeCatalog);
    slots.famousCatalogSlot.fire(readyState(fakeCatalog));

    // BOTH groups must be present simultaneously.
    expect(state.subsystems.pois.findPoi('cluster-bulk-coma')).not.toBeNull();
    const famousPois = state.subsystems.pois.getPoisForCategory('famousGalaxy');
    expect(famousPois.some((p) => p.id === 'famous-m31')).toBe(true);
  });

  it('emits onStructureCountsChange with per-category counts after a group change', () => {
    // The Structures panel reads these counts.  wirePoiProjection must fire
    // onStructureCountsChange after every group change — once at boot
    // (static anchors) and again each time a slot fires.
    const { state, slots } = makeState();
    const { cb, countsSpy } = makeCb();

    wirePoiProjection(state, cb);

    // At boot: static anchors emit counts.
    expect(countsSpy).toHaveBeenCalledTimes(1);
    const bootCounts = countsSpy.mock.calls[0]![0] as Record<string, number>;
    expect(typeof bootCounts.cluster).toBe('number');
    expect(typeof bootCounts.supercluster).toBe('number');
    expect(typeof bootCounts.void).toBe('number');

    // clusterBulk lands: counts must update.
    const clusterPayload: ClusterCatalogPayload = {
      catalog: {
        count: 1,
        positions: new Float32Array([1, 2, 3]),
        physicalRadiusMpc: new Float32Array([2]),
        apparentRadiusMpc: new Float32Array([4]),
        significance: new Float32Array([0.9]),
        category: new Uint8Array([0]),
      },
      meta: [{ id: 'coma', names: ['Coma Cluster'], abell: 'A1656', description: '' }],
    };
    (state.sources as { clusterBulk: unknown }).clusterBulk = clusterPayload;
    slots.clusterCatalogSlot.fire(readyState(clusterPayload));

    expect(countsSpy).toHaveBeenCalledTimes(2);
    const afterCluster = countsSpy.mock.calls[1]![0] as Record<string, number>;
    // The bulk payload has one cluster (meta[0]).  The count must grow by 1
    // relative to the boot call.  Non-null assertion is safe: the mock always
    // receives { cluster, supercluster, void } from emitCounts().
    expect(afterCluster['cluster']).toBe(bootCounts['cluster']! + 1);
    expect(afterCluster['supercluster']).toBe(bootCounts['supercluster']!);
    expect(afterCluster['void']).toBe(bootCounts['void']!);
  });
});
