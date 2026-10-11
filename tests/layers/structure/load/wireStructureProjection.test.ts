/**
 * wireStructureProjection — the store's two groups, and the counts + bulk
 * status it publishes as the Layer's facts at boot and on every slot change.
 *
 * `buildStaticAnchorStructures` is mocked to a fixed list (two galaxy clusters
 * plus one of each other cosmic category) so counts don't track the curated
 * JSON; the bulk records come from the real `structureCatalogToStructures`
 * over three galaxy clusters. The structure store and the slot are the
 * production ones, the slot over a mocked fetcher.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStore } from '../../../../src/store/createAppStore';
import { engineStructureSearchListChanged } from '../../../../src/state/engine/engineSlice';
import { createStructureStore } from '../../../../src/layers/structure/load/createStructureStore';
import { createStructureCatalogSlot } from '../../../../src/layers/structure/load/structureCatalogSlot';
import { structureCatalogFetcher } from '../../../../src/layers/structure/load/structureCatalogFetcher';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StructureCatalogPayload } from '../../../../src/@types/loading/structureCatalogPayload/StructureCatalogPayload';
import type { StructureFacts } from '../../../../src/layers/structure/@types/StructureFacts';

vi.mock('../../../../src/layers/structure/load/buildStaticAnchorStructures', () => ({
  buildStaticAnchorStructures: vi.fn((): StructureInfo[] =>
    (
      [
        ['galaxy-cluster-virgo', 'galaxy-cluster'],
        ['galaxy-cluster-fornax', 'galaxy-cluster'],
        ['supercluster-laniakea', 'supercluster'],
        ['void-local', 'void'],
        ['galaxy-group-local-group', 'galaxy-group'],
      ] as const
    ).map(
      ([id, category]) =>
        ({
          id,
          name: id,
          category,
          worldPos: [0, 0, 0.02],
          physicalRadiusMpc: 2,
          featured: true,
        }) as StructureInfo,
    ),
  ),
}));

vi.mock('../../../../src/layers/structure/load/structureCatalogFetcher', () => ({
  structureCatalogFetcher: vi.fn(),
}));

import { wireStructureProjection } from '../../../../src/layers/structure/load/wireStructureProjection';

// Every structure category carries a count, zero included: a missing key renders its toggle countless.
const ANCHOR_COUNTS = {
  ...Object.fromEntries(STRUCTURE_IDS.map((id) => [id, 0])),
  'galaxy-cluster': 2,
  supercluster: 1,
  void: 1,
  'galaxy-group': 1,
};

const threeClusters: StructureCatalogPayload = {
  catalog: {
    count: 3,
    positions: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    physicalRadiusMpc: new Float32Array([1.5, 2, 2.5]),
    apparentRadiusMpc: new Float32Array([3, 4, 5]),
    significance: new Float32Array([10, 20, 30]),
    category: new Uint8Array([0, 0, 0]),
  },
  meta: [
    { id: 'coma', names: ['Coma'], abell: 'A1656', description: '' },
    { id: 'perseus', names: ['Perseus'], abell: 'A426', description: '' },
    { id: 'hercules', names: ['Hercules'], abell: 'A2151', description: '' },
  ],
};

/** A real store + slot, wired, with each publish recorded beside the slot state it saw. */
function wire() {
  const runtime = { store: createStructureStore(), slot: createStructureCatalogSlot() };
  const published: Array<{ slotKind: string; patch: Partial<StructureFacts> }> = [];
  const publish = vi.fn((patch: Partial<StructureFacts>) => {
    published.push({ slotKind: runtime.slot.state().kind, patch });
  });
  const { store } = createAppStore();
  wireStructureProjection(runtime, publish, store.dispatch);
  return { runtime, published, store };
}

describe('wireStructureProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes static anchors synchronously into the structure store', () => {
    const { runtime } = wire();

    expect(runtime.store.byCategory('galaxy-cluster')).toHaveLength(2);
    expect(runtime.store.byId('galaxy-cluster-virgo')?.id).toBe('galaxy-cluster-virgo');
  });

  it('lands the bulk group when the slot resolves, keeping the anchors', async () => {
    vi.mocked(structureCatalogFetcher).mockResolvedValueOnce(threeClusters as never);
    const { runtime } = wire();

    await runtime.slot.load({});

    expect(runtime.store.byId('galaxy-cluster-bulk-coma')).not.toBeNull();
    expect(runtime.store.byId('galaxy-cluster-virgo')).not.toBeNull();
  });

  it("publishes anchor counts and bulk 'idle' at boot", () => {
    const { published } = wire();

    expect(published).toHaveLength(1);
    expect(published[0]!.patch).toEqual({ counts: ANCHOR_COUNTS, bulk: 'idle' });
  });

  it("publishes bulk 'loading' while the slot loads or commits", async () => {
    vi.mocked(structureCatalogFetcher).mockResolvedValueOnce(threeClusters as never);
    const { runtime, published } = wire();

    await runtime.slot.load({});

    const inFlight = published.filter(
      (p) => p.slotKind === 'loading' || p.slotKind === 'committing',
    );
    expect(new Set(inFlight.map((p) => p.slotKind))).toEqual(new Set(['loading', 'committing']));
    for (const p of inFlight) expect(p.patch).toEqual({ bulk: 'loading' });
  });

  it("publishes merged counts and bulk 'ready' when the slot resolves", async () => {
    vi.mocked(structureCatalogFetcher).mockResolvedValueOnce(threeClusters as never);
    const { runtime, published } = wire();

    await runtime.slot.load({});

    expect(published.at(-1)!.patch).toEqual({
      counts: { ...ANCHOR_COUNTS, 'galaxy-cluster': 5 },
      bulk: 'ready',
    });
  });

  it("publishes anchor-only counts and bulk 'error' when the slot rejects", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(structureCatalogFetcher).mockRejectedValueOnce(new HttpError(404, 'structures.ccat'));
    const { runtime, published } = wire();

    await runtime.slot.load({});

    expect(published.at(-1)!.patch).toEqual({ counts: ANCHOR_COUNTS, bulk: 'error' });
  });

  it('dispatches the structure search list with the counts, at boot and when the bulk group lands', async () => {
    vi.mocked(structureCatalogFetcher).mockResolvedValueOnce(threeClusters as never);
    const runtime = { store: createStructureStore(), slot: createStructureCatalogSlot() };
    const { store } = createAppStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const searchLists = () =>
      dispatchSpy.mock.calls
        .map((c) => c[0] as ReturnType<typeof engineStructureSearchListChanged>)
        .filter((a) => a.type === engineStructureSearchListChanged.type)
        .map((a) => a.payload.map((e) => e.id));

    wireStructureProjection(runtime, () => {}, store.dispatch);
    expect(searchLists().at(-1)).toHaveLength(5);

    await runtime.slot.load({});
    expect(searchLists().at(-1)).toEqual(runtime.store.all().map((s) => s.id));
    expect(searchLists().at(-1)).toHaveLength(8);
  });
});
