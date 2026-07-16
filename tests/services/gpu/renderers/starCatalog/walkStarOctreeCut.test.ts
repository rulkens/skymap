import { describe, expect, it } from 'vitest';
import { buildStarOctree } from '../../../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../../../tools/stars/buildStarOctree';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { mortonEncode3 } from '../../../../../src/utils/math/mortonEncode3';
import { walkStarOctreeCut } from '../../../../../src/services/gpu/renderers/starCatalog/walkStarOctreeCut';

// A leaf-cell edge of 1 pc with a zero grid origin makes grid coordinates read
// directly as parsecs, so cameras below are placed in the same frame.
const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };

/** Every leaf-cell Morton code, decoded, must be > the previous for the build. */
function sortedStars(stars: OctreeLeafStar[]): OctreeLeafStar[] {
  return [...stars].sort((a, b) => a.mortonIndex - b.mortonIndex);
}

/**
 * The eight sibling leaf cells (one full octant group) under a level-1 parent
 * at the given parent grid coordinate — one star each. Their Morton codes are
 * `(parentMorton << 3) | k`, so they share the parent `parentMorton = child >> 3`.
 */
function octantCluster(parentGrid: Vec3): OctreeLeafStar[] {
  const parentMorton = mortonEncode3(parentGrid[0], parentGrid[1], parentGrid[2]);
  const stars: OctreeLeafStar[] = [];
  for (let k = 0; k < 8; k++) {
    stars.push({
      mortonIndex: (parentMorton << 3) | k,
      offset: [512, 512, 512],
      absMag: 3,
      bpRp: 1.0,
    });
  }
  return stars;
}

/** (level, morton) → node index, for descending a chosen node's subtree. */
function indexByKey(catalog: StarCatalog): Map<string, number> {
  const map = new Map<string, number>();
  catalog.nodes.forEach((n, i) => map.set(`${n.level}:${n.mortonIndex}`, i));
  return map;
}

/**
 * The leaf node indices reachable below `nodeIndex` — the ground-truth set of
 * real-star cells the node (leaf or aggregate) stands for. Descends via the
 * childMask + (morton << 3 | octant) layout, independent of the walker.
 */
function leafNodesUnder(catalog: StarCatalog, nodeIndex: number, keys: Map<string, number>): number[] {
  const node = catalog.nodes[nodeIndex]!;
  if (node.level === 0) return [nodeIndex];
  const leaves: number[] = [];
  const base = node.mortonIndex << 3;
  for (let k = 0; k < 8; k++) {
    if ((node.childMask & (1 << k)) === 0) continue;
    const childIndex = keys.get(`${node.level - 1}:${base | k}`)!;
    leaves.push(...leafNodesUnder(catalog, childIndex, keys));
  }
  return leaves;
}

describe('walkStarOctreeCut', () => {
  it('covers every leaf star exactly once', () => {
    // A near cell at the origin plus a far octant cluster: with the camera
    // inside the near cell the cut yields a mix — the near cell refined to a
    // leaf, the far cluster collapsed to an aggregate — so the partition is
    // exercised across both draw kinds at once.
    const near: OctreeLeafStar = { mortonIndex: 0, offset: [512, 512, 512], absMag: 2, bpRp: 0.5 };
    const far = octantCluster([50, 50, 50]);
    const catalog = buildStarOctree(sortedStars([near, ...far]), GRID);
    const keys = indexByKey(catalog);

    const draws = walkStarOctreeCut(catalog, [0.5, 0.5, 0.5], { typical: 10000, hardCap: 10000 });

    // Walk each chosen node's subtree down to leaves; the union must be every
    // leaf cell exactly once (covering partition), and the reachable star total
    // must equal starCount — no double-count, no gap.
    const covered = new Map<number, number>(); // leaf node index → times seen
    let reachableStars = 0;
    for (const draw of draws) {
      for (const leafIndex of leafNodesUnder(catalog, draw.nodeIndex, keys)) {
        covered.set(leafIndex, (covered.get(leafIndex) ?? 0) + 1);
        reachableStars += catalog.nodes[leafIndex]!.recordCount;
      }
    }

    const allLeaves = catalog.nodes.filter((n) => n.level === 0).length;
    expect(covered.size).toBe(allLeaves); // no gap: every leaf represented
    for (const [, seen] of covered) expect(seen).toBe(1); // no double-draw
    expect(reachableStars).toBe(catalog.starCount);
  });

  it('respects the hard cap', () => {
    // One octant cluster of 8 single-star cells sitting on the camera, so the
    // distance heuristic alone would refine everything to 8 leaf instances.
    const catalog = buildStarOctree(sortedStars(octantCluster([0, 0, 0])), GRID);
    expect(catalog.starCount).toBe(8);

    // A generous budget fully refines — 8 leaf draws, one instance per star.
    const generous = walkStarOctreeCut(catalog, [1, 1, 1], { typical: 10000, hardCap: 10000 });
    const generousInstances = generous.reduce((s, d) => s + d.recordCount, 0);
    expect(generousInstances).toBe(catalog.starCount);

    // A hard cap below the star count forces the walker to substitute the
    // parent aggregate instead of refining into its leaves.
    const capped = walkStarOctreeCut(catalog, [1, 1, 1], { typical: 10000, hardCap: 4 });
    const cappedInstances = capped.reduce((s, d) => s + d.recordCount, 0);
    expect(cappedInstances).toBeLessThanOrEqual(4);
    expect(cappedInstances).toBeLessThan(catalog.starCount); // aggregation happened
  });

  it('refines near the camera, coarsens far', () => {
    const near: OctreeLeafStar = { mortonIndex: 0, offset: [512, 512, 512], absMag: 2, bpRp: 0.5 };
    const far = octantCluster([50, 50, 50]);
    const catalog = buildStarOctree(sortedStars([near, ...far]), GRID);

    // Camera inside the near cell, far cluster ~170 pc away.
    const draws = walkStarOctreeCut(catalog, [0.5, 0.5, 0.5], { typical: 10000, hardCap: 10000 });

    const nearDraws = draws.filter((d) => catalog.nodes[d.nodeIndex]!.level === 0);
    const farDraws = draws.filter((d) => catalog.nodes[d.nodeIndex]!.level > 0);

    // The near cell is drawn as a leaf; it is the origin cell (Morton 0).
    expect(nearDraws.length).toBe(1);
    expect(catalog.nodes[nearDraws[0]!.nodeIndex]!.mortonIndex).toBe(0);

    // The far cluster collapses to a single aggregate above leaf level.
    expect(farDraws.length).toBe(1);
    expect(catalog.nodes[farDraws[0]!.nodeIndex]!.level).toBeGreaterThan(0);
  });

  it('refines strictly more at a lower threshold (the Detail knob)', () => {
    // Same fixture as above: a near cell plus a far octant cluster ~170 pc off,
    // whose level-1 box subtends ~0.012 of its distance. The default 0.05
    // threshold treats that as sub-pixel and collapses it to one aggregate; a
    // threshold below ~0.012 clears the `angularSize >= threshold` gate, so the
    // cluster refines all the way to its eight leaf stars. Lower ⇒ more (and
    // deeper) drawn nodes — the "Detail" slider's whole contract.
    const near: OctreeLeafStar = { mortonIndex: 0, offset: [512, 512, 512], absMag: 2, bpRp: 0.5 };
    const far = octantCluster([50, 50, 50]);
    const catalog = buildStarOctree(sortedStars([near, ...far]), GRID);
    const cam: Vec3 = [0.5, 0.5, 0.5];
    const budget = { typical: 10000, hardCap: 10000 };

    const coarse = walkStarOctreeCut(catalog, cam, budget, 0.05);
    const fine = walkStarOctreeCut(catalog, cam, budget, 0.005);

    const leaves = (draws: readonly { nodeIndex: number }[]) =>
      draws.filter((d) => catalog.nodes[d.nodeIndex]!.level === 0).length;

    // Strictly more total draws AND strictly more leaf-level (fully refined)
    // draws at the lower threshold — the far cluster went from 1 aggregate to 8
    // leaves.
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(leaves(fine)).toBeGreaterThan(leaves(coarse));
  });
});
