/**
 * structureCatalogToStructures — tests for the bulk cluster/supercluster
 * structure producer.
 *
 * The producer turns the decoded `.ccat` + meta sidecar into the
 * non-featured structures that render through the ring/halo marker pass. Four
 * invariants are load-bearing and easy to break:
 *
 *   1. The `category` byte → arm mapping (0 → cluster, 1 → supercluster),
 *      with unknown bytes skipped rather than crashed on.
 *   2. Every bulk structure is `featured: false` — featured gates labels +
 *      deep-link eligibility, and a bulk catalog of ~375 structures must
 *      not flood the label layer.
 *   3. Significance normalises PER CATEGORY into [0,1] — clusters
 *      (log-scaled M500) and superclusters (linear N_m) on independent
 *      scales, so a faint SC isn't crushed by a massive cluster.
 *   4. Bulk ids carry a `-bulk-` infix so they never collide with the
 *      featured `${category}-${seed.id}` anchors and are recognisably
 *      non-deep-linkable.
 *
 * Fixtures are hand-built `StructureCatalogPayload`s — the producer is a
 * pure function over typed arrays, so no engine boot is needed.
 */

import { describe, it, expect } from 'vitest';
import { structureCatalogToStructures } from '../../../../src/services/engine/phases/structureCatalogToStructures';
import type { StructureCatalogPayload } from '../../../../src/@types/loading/StructureCatalogPayload';
import type { StructureMetaEntry } from '../../../../src/@types/loading/StructureCatalogPayload';

/**
 * Build a payload from per-record specs.  `significance` is the RAW
 * proxy (M500 for clusters, N_m for superclusters) exactly as the
 * `.ccat` carries it; the producer is responsible for normalising.
 */
function makePayload(
  records: Array<{
    pos: [number, number, number];
    physicalRadiusMpc: number;
    apparentRadiusMpc: number;
    significance: number;
    category: number;
    meta: StructureMetaEntry;
  }>,
): StructureCatalogPayload {
  const count = records.length;
  const positions = new Float32Array(count * 3);
  const physicalRadiusMpc = new Float32Array(count);
  const apparentRadiusMpc = new Float32Array(count);
  const significance = new Float32Array(count);
  const category = new Uint8Array(count);
  records.forEach((r, i) => {
    positions[i * 3 + 0] = r.pos[0];
    positions[i * 3 + 1] = r.pos[1];
    positions[i * 3 + 2] = r.pos[2];
    physicalRadiusMpc[i] = r.physicalRadiusMpc;
    apparentRadiusMpc[i] = r.apparentRadiusMpc;
    significance[i] = r.significance;
    category[i] = r.category;
  });
  return {
    catalog: { count, positions, physicalRadiusMpc, apparentRadiusMpc, significance, category },
    meta: records.map((r) => r.meta),
  };
}

const meta = (id: string, abell: string | null = null, description = ''): StructureMetaEntry => ({
  id,
  names: [id.toUpperCase()],
  abell,
  description,
});

// A mixed fixture: two clusters (byte 0) of differing M500, two
// superclusters (byte 1) of differing N_m.  The cluster M500 values are
// orders of magnitude larger than the SC member counts, which is the
// whole point of normalising the two categories independently.
function mixedPayload(): StructureCatalogPayload {
  return makePayload([
    {
      pos: [1, 2, 3],
      physicalRadiusMpc: 1.5,
      apparentRadiusMpc: 3,
      significance: 2.0, // low-mass cluster (M500 in 1e14 Msun)
      category: 0,
      meta: meta('low-cluster', 'A100'),
    },
    {
      pos: [4, 5, 6],
      physicalRadiusMpc: 2.5,
      apparentRadiusMpc: 5,
      significance: 20.0, // high-mass cluster
      category: 0,
      meta: meta('high-cluster', 'A2670'),
    },
    {
      pos: [7, 8, 9],
      physicalRadiusMpc: 30,
      apparentRadiusMpc: 30,
      significance: 8, // small supercluster (N_m members)
      category: 1,
      meta: meta('small-sc'),
    },
    {
      pos: [10, 11, 12],
      physicalRadiusMpc: 50,
      apparentRadiusMpc: 50,
      significance: 60, // rich supercluster
      category: 1,
      meta: meta('rich-sc'),
    },
  ]);
}

describe('structureCatalogToStructures', () => {
  it('maps category bytes to cluster/supercluster', () => {
    const structures = structureCatalogToStructures(mixedPayload());
    expect(structures.filter((p) => p.category === 'cluster')).toHaveLength(2);
    expect(structures.filter((p) => p.category === 'supercluster')).toHaveLength(2);
  });

  it('marks every structure not featured', () => {
    const structures = structureCatalogToStructures(mixedPayload());
    expect(structures.every((p) => p.featured === false)).toBe(true);
  });

  it('carries worldPos + radii through from the catalog', () => {
    const structures = structureCatalogToStructures(mixedPayload());
    const low = structures.find((p) => p.id.includes('low-cluster'))!;
    expect(low.worldPos).toEqual([1, 2, 3]);
    expect(low.category === 'cluster' && low.physicalRadiusMpc).toBe(1.5);
    expect(low.category === 'cluster' && low.apparentRadiusMpc).toBe(3);
  });

  it('normalizes significance per-category into [0,1] on independent scales', () => {
    const structures = structureCatalogToStructures(mixedPayload());
    const sig = (idFrag: string) => {
      const p = structures.find((q) => q.id.includes(idFrag))!;
      // significance lives on the extended-structure arms.
      return p.category === 'cluster' || p.category === 'supercluster' ? p.significance : undefined;
    };
    // All normalized values within [0,1].
    for (const p of structures) {
      const s = p.category === 'cluster' || p.category === 'supercluster' ? p.significance : 1;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    // The most massive cluster and the richest SC both reach 1, INDEPENDENTLY.
    expect(sig('high-cluster')).toBeCloseTo(1);
    expect(sig('rich-sc')).toBeCloseTo(1);
    // The low-mass cluster maps to 0 (it's the subset min on the log scale).
    expect(sig('low-cluster')).toBeCloseTo(0);
    // The small SC maps to 0 (subset min on the linear scale).
    expect(sig('small-sc')).toBeCloseTo(0);
    // Cross-category proof: the small SC (N_m=8) is NOT dragged toward 0 by
    // the huge cluster M500 — it's evaluated against the SC subset alone, so
    // it sits at the SC subset's own min (0), not somewhere tiny on a shared
    // mixed M500/N_m scale.  And the rich SC reaches full weight despite its
    // raw value (60) being far below the cluster M500 max scale.
    expect(sig('rich-sc')).toBeGreaterThan(sig('high-cluster')! - 0.0001);
  });

  it('ids are prefixed bulk and never collide with featured slugs', () => {
    const structures = structureCatalogToStructures(mixedPayload());
    for (const p of structures) {
      expect(p.id).toMatch(/^(cluster|supercluster)-bulk-/);
    }
  });

  it('carries the abell designation from meta onto the cluster arm only', () => {
    const structures = structureCatalogToStructures(mixedPayload());
    const high = structures.find((p) => p.id.includes('high-cluster'))!;
    expect(high.category).toBe('cluster');
    expect(high.category === 'cluster' && high.abell).toBe('A2670');
    // Superclusters never carry abell.
    const sc = structures.find((p) => p.id.includes('rich-sc'))!;
    expect('abell' in sc).toBe(false);
  });

  it('carries the meta description through onto every bulk structure', () => {
    const payload = makePayload([
      {
        pos: [0, 0, 0],
        physicalRadiusMpc: 1,
        apparentRadiusMpc: 2,
        significance: 5,
        category: 0,
        meta: meta('described-cluster', 'A1', 'X-ray cluster · M500 = 5.0×10¹⁴ M☉ · z = 0.040'),
      },
    ]);
    const structure = structureCatalogToStructures(payload)[0]!;
    expect(structure.description).toBe('X-ray cluster · M500 = 5.0×10¹⁴ M☉ · z = 0.040');
  });

  it('omits abell when the meta entry has null (key absent, not undefined)', () => {
    const payload = makePayload([
      {
        pos: [0, 0, 0],
        physicalRadiusMpc: 1,
        apparentRadiusMpc: 2,
        significance: 5,
        category: 0,
        meta: meta('no-abell-cluster', null),
      },
    ]);
    const structures = structureCatalogToStructures(payload);
    expect('abell' in structures[0]!).toBe(false);
  });

  it('names the structure from meta.names[0]', () => {
    const structures = structureCatalogToStructures(mixedPayload());
    const high = structures.find((p) => p.id.includes('high-cluster'))!;
    expect(high.name).toBe('HIGH-CLUSTER');
  });

  it('skips records with an unknown category byte', () => {
    const payload = makePayload([
      {
        pos: [0, 0, 0],
        physicalRadiusMpc: 1,
        apparentRadiusMpc: 2,
        significance: 5,
        category: 0,
        meta: meta('ok-cluster'),
      },
      {
        pos: [1, 1, 1],
        physicalRadiusMpc: 1,
        apparentRadiusMpc: 2,
        significance: 5,
        category: 2, // reserved / void — not yet a renderable arm
        meta: meta('reserved'),
      },
    ]);
    const structures = structureCatalogToStructures(payload);
    expect(structures).toHaveLength(1);
    expect(structures[0]!.id).toContain('ok-cluster');
  });

  it('maps a single-member subset to full weight (no divide-by-zero)', () => {
    // One cluster only: max === min, so it should map to 1 rather than NaN.
    const payload = makePayload([
      {
        pos: [0, 0, 0],
        physicalRadiusMpc: 1,
        apparentRadiusMpc: 2,
        significance: 7,
        category: 0,
        meta: meta('solo-cluster'),
      },
    ]);
    const structures = structureCatalogToStructures(payload);
    const p = structures[0]!;
    expect(p.category === 'cluster' && p.significance).toBeCloseTo(1);
  });

  it('returns an empty list for an empty catalog', () => {
    const payload = makePayload([]);
    expect(structureCatalogToStructures(payload)).toEqual([]);
  });
});
