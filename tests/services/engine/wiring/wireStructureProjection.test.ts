/**
 * wireStructureProjection — unit tests for the structure-group wiring
 * extracted from wireSlots.
 *
 * ### What this tests
 *
 *   1. Static anchors publish synchronously into the structure store — no
 *      async arrival needed; `byCategory('cluster')` is non-empty after the
 *      call so the Structures panel has counts from frame 1.
 *   2. The bulk cluster group lands in the store when the cluster-catalog
 *      slot fires, without clobbering the anchors group.
 *   3. `onStructureCountsChange` fires after any group change with fresh
 *      per-category counts.
 *
 * Famous galaxies are NOT wired here anymore — `produceFamousLabels` derives
 * them straight from `galaxyStore` per frame — so there is no famous-group
 * test in this suite.
 *
 * ### Mocking strategy
 *
 * `buildStaticAnchorPois` is mocked to a deterministic minimal list so tests
 * don't depend on the curated JSON.  `clusterCatalogToStructures` is mocked to
 * one record per meta entry.  The structure store is a real `createEngineData`
 * instance so `setGroup` / `byCategory` behave exactly as production.  The
 * cluster slot is a light fake with a `fire` helper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';
import type { ClusterCatalogPayload } from '../../../../src/@types/loading/ClusterCatalogPayload';

// ── Module mocks ───────────────────────────────────────────────────────

vi.mock('../../../../src/data/buildStaticAnchorPois', () => ({
  buildStaticAnchorPois: vi.fn((): StructureRecord[] => [
    {
      id: 'cluster-virgo',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0.016],
      physicalRadiusMpc: 2.2,
      featured: true,
    } as StructureRecord,
    {
      id: 'supercluster-laniakea',
      name: 'Laniakea',
      category: 'supercluster',
      worldPos: [0, 0, 0.08],
      physicalRadiusMpc: 160,
      featured: true,
    } as StructureRecord,
    {
      id: 'void-local',
      name: 'Local Void',
      category: 'void',
      worldPos: [0.05, 0, 0],
      physicalRadiusMpc: 45,
      featured: true,
    } as StructureRecord,
  ]),
}));

// clusterCatalogToStructures: one record per entry in payload.meta.
vi.mock('../../../../src/services/engine/phases/clusterCatalogToStructures', () => ({
  clusterCatalogToStructures: vi.fn(
    (payload: ClusterCatalogPayload): StructureRecord[] =>
      payload.meta.map((m) => ({
        id: `cluster-bulk-${m.id}`,
        name: m.names[0],
        category: 'cluster',
        worldPos: [0, 0, 0],
        physicalRadiusMpc: 2,
        featured: false,
      })) as StructureRecord[],
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────
import { wireStructureProjection } from '../../../../src/services/engine/wiring/wireStructureProjection';

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

// ── State builder ──────────────────────────────────────────────────────

function makeState(): { state: EngineState; clusterCatalogSlot: FakeSlot<ClusterCatalogPayload> } {
  const clusterCatalogSlot = makeSlot<ClusterCatalogPayload>();
  const state = {
    data: createEngineData(),
    assetSlots: {
      clusterCatalog: {
        name: 'cluster-catalog',
        subscribe: clusterCatalogSlot.subscribe,
        load: vi.fn(),
        state: () => ({ kind: 'idle' }),
        current: () => null,
        forceReload: vi.fn(),
        cancel: vi.fn(),
      },
    },
  } as unknown as EngineState;
  return { state, clusterCatalogSlot };
}

function makeCb(): { cb: EngineCallbacks; countsSpy: ReturnType<typeof vi.fn> } {
  const countsSpy = vi.fn();
  const cb = { sources: { onStructureCountsChange: countsSpy } } as unknown as EngineCallbacks;
  return { cb, countsSpy };
}

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

// ── Tests ──────────────────────────────────────────────────────────────

describe('wireStructureProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes static anchors synchronously into the structure store', () => {
    const { state } = makeState();
    const { cb } = makeCb();

    wireStructureProjection(state, cb);

    expect(state.data.structures.byCategory('cluster').length).toBeGreaterThan(0);
    expect(state.data.structures.byCategory('supercluster').length).toBeGreaterThan(0);
    expect(state.data.structures.byCategory('void').length).toBeGreaterThan(0);
    expect(state.data.structures.byId('cluster-virgo')?.id).toBe('cluster-virgo');
  });

  it('lands the bulk cluster group when the slot fires, keeping the anchors', () => {
    const { state, clusterCatalogSlot } = makeState();
    const { cb } = makeCb();

    wireStructureProjection(state, cb);
    clusterCatalogSlot.fire(readyState(clusterPayload));

    expect(state.data.structures.byId('cluster-bulk-coma')?.id).toBe('cluster-bulk-coma');
    // Anchors survive the bulk write (separate group).
    expect(state.data.structures.byId('cluster-virgo')?.id).toBe('cluster-virgo');
  });

  it('clears the bulk group and re-emits counts on a slot error', () => {
    const { state, clusterCatalogSlot } = makeState();
    const { cb, countsSpy } = makeCb();

    wireStructureProjection(state, cb);
    clusterCatalogSlot.fire(readyState(clusterPayload));
    expect(state.data.structures.byId('cluster-bulk-coma')).not.toBeNull();

    countsSpy.mockClear();
    clusterCatalogSlot.fire({
      kind: 'error',
      req: {},
      error: new Error('fetch failed'),
      finalAttempt: 1,
    });
    expect(state.data.structures.byId('cluster-bulk-coma')).toBeNull();
    expect(countsSpy).toHaveBeenCalled();
  });

  it('emits onStructureCountsChange with per-category counts after a group change', () => {
    const { state, clusterCatalogSlot } = makeState();
    const { cb, countsSpy } = makeCb();

    wireStructureProjection(state, cb);

    // At boot: static anchors emit counts.
    expect(countsSpy).toHaveBeenCalledTimes(1);
    const bootCounts = countsSpy.mock.calls[0]![0] as Record<string, number>;
    expect(typeof bootCounts.cluster).toBe('number');
    expect(typeof bootCounts.supercluster).toBe('number');
    expect(typeof bootCounts.void).toBe('number');

    clusterCatalogSlot.fire(readyState(clusterPayload));

    expect(countsSpy).toHaveBeenCalledTimes(2);
    const afterCluster = countsSpy.mock.calls[1]![0] as Record<string, number>;
    expect(afterCluster['cluster']).toBe(bootCounts['cluster']! + 1);
    expect(afterCluster['supercluster']).toBe(bootCounts['supercluster']!);
    expect(afterCluster['void']).toBe(bootCounts['void']!);
  });
});
