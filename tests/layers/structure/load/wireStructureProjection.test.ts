/**
 * wireStructureProjection — the store's two groups, and the counts, search list
 * and bulk status it publishes as the Layer's facts at boot and on every slot
 * change.
 *
 * `buildStaticAnchorStructures` is mocked to two galaxy clusters so counts don't
 * track the curated JSON; the bulk records come from the real
 * `structureCatalogToStructures` over three more. The structure store and the
 * slot are the production ones, the slot over a mocked fetcher.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    ['galaxy-cluster-virgo', 'galaxy-cluster-fornax'].map(
      (id) =>
        ({
          id,
          name: id,
          category: 'galaxy-cluster',
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

// Every structure category carries a count, zero included: a missing key
// renders its toggle countless.
const NO_COUNTS = Object.fromEntries(STRUCTURE_IDS.map((id) => [id, 0]));
const ANCHOR_IDS = ['galaxy-cluster-virgo', 'galaxy-cluster-fornax'];
const BULK_IDS = [
  'galaxy-cluster-bulk-coma',
  'galaxy-cluster-bulk-perseus',
  'galaxy-cluster-bulk-hercules',
];

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

/** A real store + slot, wired, each publish recorded (search list as ids) beside the slot state it saw. */
function wire() {
  const runtime = { store: createStructureStore(), slot: createStructureCatalogSlot() };
  const published: Array<{ slotKind: string; patch: object }> = [];
  wireStructureProjection(runtime, ({ searchList, ...rest }: Partial<StructureFacts>) => {
    published.push({
      slotKind: runtime.slot.state().kind,
      patch: searchList ? { ...rest, searchList: searchList.map((e) => e.id) } : rest,
    });
  });
  return { runtime, published };
}

describe('wireStructureProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes anchor counts and bulk 'idle' at boot", () => {
    const { published } = wire();

    expect(published).toHaveLength(1);
    expect(published[0]!.patch).toEqual({
      counts: { ...NO_COUNTS, 'galaxy-cluster': 2 },
      searchList: ANCHOR_IDS,
      bulk: 'idle',
    });
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
      counts: { ...NO_COUNTS, 'galaxy-cluster': 5 },
      searchList: [...ANCHOR_IDS, ...BULK_IDS],
      bulk: 'ready',
    });
  });

  // A cancel with nothing committed rolls the slot back to 'idle'; a stale
  // 'loading' there would hold a structure focus deferral forever.
  it("publishes bulk 'idle' when a load in flight is cancelled", () => {
    vi.mocked(structureCatalogFetcher).mockReturnValueOnce(new Promise(() => {}) as never);
    const { runtime, published } = wire();

    void runtime.slot.load({});
    runtime.slot.cancel();

    expect(published.at(-1)!.patch).toEqual({ bulk: 'idle' });
  });

  it("publishes anchor-only counts and bulk 'error' when the slot rejects", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(structureCatalogFetcher).mockRejectedValueOnce(new HttpError(404, 'structures.ccat'));
    const { runtime, published } = wire();

    await runtime.slot.load({});

    expect(published.at(-1)!.patch).toEqual({
      counts: { ...NO_COUNTS, 'galaxy-cluster': 2 },
      searchList: ANCHOR_IDS,
      bulk: 'error',
    });
  });
});
