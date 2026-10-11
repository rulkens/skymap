/**
 * wireStructureProjection — unit tests for the structure-group wiring.
 *
 * ### What this tests
 *
 *   1. Static anchors publish synchronously into the structure store — no
 *      async arrival needed; `byCategory('galaxy-cluster')` is non-empty after the
 *      call so the Structures panel has counts from frame 1.
 *   2. The bulk cluster group lands in the store when the structure-catalog
 *      slot fires, without clobbering the anchors group.
 *   3. `engineStructureCountsChanged` fires after any group change with fresh
 *      per-category counts.
 *
 * Famous galaxies are NOT wired here anymore — `produceFamousGalaxyLabels` derives
 * them straight from `galaxyStore` per frame — so there is no famous-group
 * test in this suite.
 *
 * ### Mocking strategy
 *
 * `buildStaticAnchorStructures` is mocked to a deterministic minimal list so tests
 * don't depend on the curated JSON; the bulk records come from the real
 * `structureCatalogToStructures`. The structure store is a real
 * `createStructureStore` so `setGroup` / `byCategory` behave exactly as
 * production. The cluster slot is a light fake with a `fire` helper, except
 * where a real slot drives the mocked fetcher end to end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStore } from '../../../../src/store/createAppStore';
import {
  engineStructureCountsChanged,
  engineStructureSearchListChanged,
} from '../../../../src/state/engine/engineSlice';
import { createStructureStore } from '../../../../src/layers/structure/load/createStructureStore';
import { createStructureCatalogSlot } from '../../../../src/layers/structure/load/structureCatalogSlot';
import { structureCatalogFetcher } from '../../../../src/layers/structure/load/structureCatalogFetcher';
import type { AppStore } from '../../../../src/store/types';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StructureCatalogPayload } from '../../../../src/@types/loading/structureCatalogPayload/StructureCatalogPayload';
import type { StructureRuntime } from '../../../../src/layers/structure/@types/StructureRuntime';

// ── Module mocks ───────────────────────────────────────────────────────

vi.mock('../../../../src/layers/structure/load/buildStaticAnchorStructures', () => ({
  buildStaticAnchorStructures: vi.fn((): StructureInfo[] => [
    {
      id: 'galaxy-cluster-virgo',
      name: 'Virgo Cluster',
      category: 'galaxy-cluster',
      worldPos: [0, 0, 0.016],
      physicalRadiusMpc: 2.2,
      featured: true,
    } as StructureInfo,
    {
      id: 'supercluster-laniakea',
      name: 'Laniakea',
      category: 'supercluster',
      worldPos: [0, 0, 0.08],
      physicalRadiusMpc: 160,
      featured: true,
    } as StructureInfo,
    {
      id: 'void-local',
      name: 'Local Void',
      category: 'void',
      worldPos: [0.05, 0, 0],
      physicalRadiusMpc: 45,
      featured: true,
    } as StructureInfo,
    {
      id: 'galaxy-group-local-group',
      name: 'Local Group',
      category: 'galaxy-group',
      worldPos: [0, 0, 0],
      physicalRadiusMpc: 0.16,
      apparentRadiusMpc: 0.94,
      featured: true,
    } as StructureInfo,
  ]),
}));

vi.mock('../../../../src/layers/structure/load/structureCatalogFetcher', () => ({
  structureCatalogFetcher: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────────
import { wireStructureProjection } from '../../../../src/layers/structure/load/wireStructureProjection';

// ── Fake slot helper ───────────────────────────────────────────────────

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

function readyState<V>(value: V): LoadState<V> {
  return { kind: 'ready', req: {}, value, loadedAtMs: 0 };
}

// ── Runtime builder ────────────────────────────────────────────────────

function makeRuntime(): {
  runtime: Pick<StructureRuntime, 'store' | 'slot'>;
  structureCatalogSlot: FakeSlot<StructureCatalogPayload>;
} {
  const structureCatalogSlot = makeSlot<StructureCatalogPayload>();
  const runtime = {
    store: createStructureStore(),
    slot: { subscribe: structureCatalogSlot.subscribe },
  } as unknown as Pick<StructureRuntime, 'store' | 'slot'>;
  return { runtime, structureCatalogSlot };
}

function makeStore(): {
  store: AppStore;
  // The per-category count payloads dispatched so far, newest last.
  structureCountsCalls: () => Array<Partial<Record<string, number>>>;
} {
  const { store } = createAppStore();
  const dispatchSpy = vi.spyOn(store, 'dispatch');
  const structureCountsCalls = () =>
    dispatchSpy.mock.calls
      .map((c) => c[0] as ReturnType<typeof engineStructureCountsChanged>)
      .filter((a) => a.type === engineStructureCountsChanged.type)
      .map((a) => a.payload);
  return { store, structureCountsCalls };
}

const clusterPayload: StructureCatalogPayload = {
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

// One cluster + one supercluster, loaded through a real slot.
const clusterAndSuperclusterPayload: StructureCatalogPayload = {
  catalog: {
    count: 2,
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    physicalRadiusMpc: new Float32Array([1.5, 30]),
    apparentRadiusMpc: new Float32Array([3, 30]),
    significance: new Float32Array([10, 25]),
    category: new Uint8Array([0, 1]),
  },
  meta: [
    { id: 'coma', names: ['Coma'], abell: 'A1656', description: '' },
    { id: 'shapley', names: ['Shapley'], abell: null, description: '' },
  ],
};

/** The production slot over the mocked fetcher, resolved with `payload`. */
function realSlotResolving(
  payload: StructureCatalogPayload,
): Pick<StructureRuntime, 'store' | 'slot'> {
  vi.mocked(structureCatalogFetcher).mockResolvedValueOnce(payload as never);
  return { store: createStructureStore(), slot: createStructureCatalogSlot() };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('wireStructureProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes static anchors synchronously into the structure store', () => {
    const { runtime } = makeRuntime();
    const { store } = makeStore();

    wireStructureProjection(runtime, store.dispatch);

    expect(runtime.store.byCategory('galaxy-cluster').length).toBeGreaterThan(0);
    expect(runtime.store.byCategory('supercluster').length).toBeGreaterThan(0);
    expect(runtime.store.byCategory('void').length).toBeGreaterThan(0);
    expect(runtime.store.byId('galaxy-cluster-virgo')?.id).toBe('galaxy-cluster-virgo');
  });

  it('lands the bulk cluster group when the slot fires, keeping the anchors', () => {
    const { runtime, structureCatalogSlot } = makeRuntime();
    const { store } = makeStore();

    wireStructureProjection(runtime, store.dispatch);
    structureCatalogSlot.fire(readyState(clusterPayload));

    expect(runtime.store.byId('galaxy-cluster-bulk-coma')?.id).toBe('galaxy-cluster-bulk-coma');
    // Anchors survive the bulk write (separate group).
    expect(runtime.store.byId('galaxy-cluster-virgo')?.id).toBe('galaxy-cluster-virgo');
  });

  it('lands bulk clusters + superclusters in the structure store, keeping anchors', async () => {
    // The slot's load resolves with one cluster + one supercluster; the
    // projection builds bulk records (via the real structureCatalogToStructures)
    // and writes them to the store's 'bulk' group, alongside the anchors.
    const runtime = realSlotResolving(clusterAndSuperclusterPayload);
    const { store } = makeStore();

    wireStructureProjection(runtime, store.dispatch);
    await runtime.slot.load({});

    expect(runtime.store.byId('galaxy-cluster-bulk-coma')).not.toBeNull();
    expect(runtime.store.byId('supercluster-bulk-shapley')).not.toBeNull();
    // Static anchors survive the bulk write (separate group).
    expect(runtime.store.byCategory('galaxy-cluster').length).toBeGreaterThan(0);
  });

  it('clears the bulk group and re-emits counts on a slot error', () => {
    const { runtime, structureCatalogSlot } = makeRuntime();
    const { store, structureCountsCalls } = makeStore();

    wireStructureProjection(runtime, store.dispatch);
    structureCatalogSlot.fire(readyState(clusterPayload));
    expect(runtime.store.byId('galaxy-cluster-bulk-coma')).not.toBeNull();

    const beforeError = structureCountsCalls().length;
    structureCatalogSlot.fire({
      kind: 'error',
      req: {},
      error: new Error('fetch failed'),
      finalAttempt: 1,
    });
    expect(runtime.store.byId('galaxy-cluster-bulk-coma')).toBeNull();
    // The error path re-emits counts (a fresh dispatch beyond those before it).
    expect(structureCountsCalls().length).toBeGreaterThan(beforeError);
  });

  it('publishes the structure search list with the counts, at boot and when the bulk group lands', () => {
    const { runtime, structureCatalogSlot } = makeRuntime();
    const { store } = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    wireStructureProjection(runtime, store.dispatch);
    const bootIds = dispatchSpy.mock.calls
      .map((c) => c[0] as ReturnType<typeof engineStructureSearchListChanged>)
      .filter((a) => a.type === engineStructureSearchListChanged.type)
      .flatMap((a) => a.payload.map((e) => e.id));
    expect(bootIds).toEqual(runtime.store.all().map((s) => s.id));

    structureCatalogSlot.fire(readyState(clusterPayload));
    const afterIds = dispatchSpy.mock.calls
      .map((c) => c[0] as ReturnType<typeof engineStructureSearchListChanged>)
      .filter((a) => a.type === engineStructureSearchListChanged.type)
      .at(-1)!
      .payload.map((e) => e.id);
    expect(afterIds).toEqual(runtime.store.all().map((s) => s.id));
  });

  it('dispatches engineStructureCountsChanged with four-category counts at boot', () => {
    const { runtime } = makeRuntime();
    const { store } = makeStore();
    const spy = vi.spyOn(store, 'dispatch');

    wireStructureProjection(runtime, store.dispatch);

    expect(spy).toHaveBeenCalledWith(
      engineStructureCountsChanged(
        expect.objectContaining({
          'galaxy-cluster': expect.any(Number),
          supercluster: expect.any(Number),
          void: expect.any(Number),
          'galaxy-group': expect.any(Number),
        }),
      ),
    );
  });

  it('dispatches engineStructureCountsChanged with per-category counts after a group change', () => {
    const { runtime, structureCatalogSlot } = makeRuntime();
    const { store, structureCountsCalls } = makeStore();

    wireStructureProjection(runtime, store.dispatch);

    // At boot: static anchors emit counts.
    expect(structureCountsCalls()).toHaveLength(1);
    const bootCounts = structureCountsCalls()[0]!;
    expect(typeof bootCounts['galaxy-cluster']).toBe('number');
    expect(typeof bootCounts.supercluster).toBe('number');
    expect(typeof bootCounts.void).toBe('number');
    // Every structure category must be reported — group included, else the
    // Settings panel renders its toggle with no count.
    expect(bootCounts['galaxy-group']).toBe(1);

    structureCatalogSlot.fire(readyState(clusterPayload));

    expect(structureCountsCalls()).toHaveLength(2);
    const afterCluster = structureCountsCalls()[1]!;
    expect(afterCluster['galaxy-cluster']).toBe(bootCounts['galaxy-cluster']! + 1);
    expect(afterCluster['supercluster']).toBe(bootCounts['supercluster']!);
    expect(afterCluster['void']).toBe(bootCounts['void']!);
    expect(afterCluster['galaxy-group']).toBe(bootCounts['galaxy-group']!);
  });

  it('emits per-category structure counts that grow when the bulk catalog lands', async () => {
    // Asserting the DELTA (one extra cluster + one extra SC, voids unchanged)
    // keeps the test robust to seed-anchor count changes.
    const runtime = realSlotResolving(clusterAndSuperclusterPayload);
    const { store, structureCountsCalls } = makeStore();

    wireStructureProjection(runtime, store.dispatch);
    await runtime.slot.load({});

    const counts = structureCountsCalls();
    expect(counts.length).toBeGreaterThanOrEqual(2);
    const first = counts[0]!;
    const last = counts[counts.length - 1]!;
    // Bulk adds one cluster (Coma) + one supercluster (Shapley); voids
    // come only from the static seed, so that count is unchanged.
    expect(last['galaxy-cluster']!).toBe(first['galaxy-cluster']! + 1);
    expect(last.supercluster!).toBe(first.supercluster! + 1);
    expect(last.void!).toBe(first.void!);
  });
});
