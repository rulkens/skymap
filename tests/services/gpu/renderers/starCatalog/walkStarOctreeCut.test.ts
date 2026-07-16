import { describe, expect, it } from 'vitest';
import { buildStarOctree, STAR_LEAF_CAPACITY } from '../../../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../../../tools/stars/buildStarOctree';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { mortonEncode3 } from '../../../../../src/utils/math/mortonEncode3';
import { walkStarOctreeCut } from '../../../../../src/services/gpu/renderers/starCatalog/walkStarOctreeCut';

// A leaf-cell edge of 1 pc with a zero grid origin makes grid coordinates read
// directly as parsecs, so cameras below are placed in the same frame.
const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };
const BIG = { typical: 100000, hardCap: 100000 };

function sortedStars(stars: OctreeLeafStar[]): OctreeLeafStar[] {
  return [...stars].sort((a, b) => a.mortonIndex - b.mortonIndex);
}

/** `count` stars packed into a single leaf cell `morton`. */
function cellStars(morton: number, count: number): OctreeLeafStar[] {
  const stars: OctreeLeafStar[] = [];
  for (let s = 0; s < count; s++) {
    stars.push({ mortonIndex: morton, offset: [(s * 7) % 1024, 512, 512], absMag: 3, bpRp: 1.0 });
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
 * The terminal childless nodes (real-star leaves — level-0 OR fat) reachable
 * below `nodeIndex`. Descends aggregates via childMask + (morton << 3 | octant);
 * a childless node (leaf or fat leaf) is terminal. Independent of the walker.
 */
function leavesUnder(catalog: StarCatalog, nodeIndex: number, keys: Map<string, number>): number[] {
  const node = catalog.nodes[nodeIndex]!;
  if (node.childMask === 0) return [nodeIndex]; // leaf or fat leaf — terminal
  const leaves: number[] = [];
  const base = node.mortonIndex << 3;
  for (let k = 0; k < 8; k++) {
    if ((node.childMask & (1 << k)) === 0) continue;
    leaves.push(...leavesUnder(catalog, keys.get(`${node.level - 1}:${base | k}`)!, keys));
  }
  return leaves;
}

// A fixture with all three node species at once: a dense core cell (Morton 0,
// capacity+1 stars) that cannot split, a distant sparse pair (cells 8, 9)
// whose 4-star subtree folds into a fat leaf, and the aggregates spanning them.
function mixedCatalog(): StarCatalog {
  const dense = cellStars(0, STAR_LEAF_CAPACITY + 1);
  const sparse: OctreeLeafStar[] = [
    { mortonIndex: 8, offset: [100, 200, 300], absMag: 4, bpRp: 0.5 },
    { mortonIndex: 8, offset: [700, 40, 900], absMag: 4, bpRp: 0.5 },
    { mortonIndex: 9, offset: [10, 500, 30], absMag: 4, bpRp: 0.5 },
    { mortonIndex: 9, offset: [900, 5, 600], absMag: 4, bpRp: 0.5 },
  ];
  return buildStarOctree(sortedStars([...dense, ...sparse]), GRID);
}

describe('walkStarOctreeCut', () => {
  it('covers every leaf star exactly once even with a fat leaf in the catalog', () => {
    const catalog = mixedCatalog();
    const keys = indexByKey(catalog);
    // Sanity: the fixture really does contain a fat leaf (childMask 0 above
    // level 0) — otherwise the property below would be vacuous.
    expect(catalog.nodes.some((n) => n.level > 0 && n.childMask === 0)).toBe(true);

    const draws = walkStarOctreeCut(catalog, [0.5, 0.5, 0.5], BIG);

    // Each committed node's subtree of terminal leaves, unioned, must be every
    // terminal leaf exactly once, and the reachable star total must equal
    // starCount — no double-count, no gap, fat leaves included.
    const covered = new Map<number, number>();
    let reachableStars = 0;
    for (const draw of draws) {
      for (const leafIndex of leavesUnder(catalog, draw.nodeIndex, keys)) {
        covered.set(leafIndex, (covered.get(leafIndex) ?? 0) + 1);
        reachableStars += catalog.nodes[leafIndex]!.recordCount;
      }
    }
    const allTerminals = catalog.nodes.filter((n) => n.childMask === 0).length;
    expect(covered.size).toBe(allTerminals);
    for (const [, seen] of covered) expect(seen).toBe(1);
    expect(reachableStars).toBe(catalog.starCount);
  });

  it('never refines a fat leaf — it is drawn whole regardless of proximity', () => {
    const catalog = mixedCatalog();
    const fatLeafIndex = catalog.nodes.findIndex((n) => n.level === 1 && n.mortonIndex === 1);
    expect(fatLeafIndex).toBeGreaterThanOrEqual(0);
    const fatLeaf = catalog.nodes[fatLeafIndex]!;

    // Camera sitting right on the fat leaf's box (grid cells 2..3 on x) with a
    // fine threshold: a refinable node here would split, but a fat leaf has no
    // children, so it commits as ONE draw carrying its whole star count.
    const draws = walkStarOctreeCut(catalog, [2.5, 0.5, 0.5], BIG, 0.0001);
    const fatDraws = draws.filter((d) => d.nodeIndex === fatLeafIndex);
    expect(fatDraws.length).toBe(1);
    expect(fatDraws[0]!.recordCount).toBe(fatLeaf.recordCount);
  });

  it('respects the hard cap by drawing an aggregate instead of refining', () => {
    // Two dense sibling cells (capacity+1 stars each) share a level-1 parent, so
    // that parent is a real aggregate over two level-0 leaves.
    const parent = mortonEncode3(3, 0, 0);
    const a = (parent << 3) | 0;
    const b = (parent << 3) | 1;
    const catalog = buildStarOctree(
      sortedStars([...cellStars(a, STAR_LEAF_CAPACITY + 1), ...cellStars(b, STAR_LEAF_CAPACITY + 1)]),
      GRID,
    );
    expect(catalog.starCount).toBe(2 * (STAR_LEAF_CAPACITY + 1));
    const cam: Vec3 = [6.5, 0.5, 0.5]; // on the box (grid 6..7 on x)

    // Generous budget fully refines to the two dense leaves.
    const generous = walkStarOctreeCut(catalog, cam, BIG);
    expect(generous.reduce((s, d) => s + d.recordCount, 0)).toBe(catalog.starCount);

    // A hard cap below the star count forces the parent aggregate (1 instance).
    const capped = walkStarOctreeCut(catalog, cam, { typical: BIG.typical, hardCap: STAR_LEAF_CAPACITY });
    const cappedInstances = capped.reduce((s, d) => s + d.recordCount, 0);
    expect(cappedInstances).toBeLessThanOrEqual(STAR_LEAF_CAPACITY);
    expect(cappedInstances).toBeLessThan(catalog.starCount);
  });

  it('refines near the camera, coarsens the far aggregate', () => {
    // Near dense cell at the origin; a far two-cell dense cluster (a real
    // aggregate) ~170 pc away.
    const parent = mortonEncode3(50, 50, 50);
    const far = buildStarOctree(
      sortedStars([
        ...cellStars(0, STAR_LEAF_CAPACITY + 1),
        ...cellStars((parent << 3) | 0, STAR_LEAF_CAPACITY + 1),
        ...cellStars((parent << 3) | 1, STAR_LEAF_CAPACITY + 1),
      ]),
      GRID,
    );

    const draws = walkStarOctreeCut(far, [0.5, 0.5, 0.5], BIG);
    const nearDraws = draws.filter((d) => far.nodes[d.nodeIndex]!.childMask === 0);
    const farDraws = draws.filter((d) => far.nodes[d.nodeIndex]!.childMask !== 0);

    // The near cell is drawn refined (a childless leaf at Morton 0).
    expect(nearDraws.some((d) => far.nodes[d.nodeIndex]!.mortonIndex === 0)).toBe(true);
    // The far cluster collapses to one or more aggregates (childMask != 0).
    expect(farDraws.length).toBeGreaterThan(0);
  });

  it('refines strictly more at a lower threshold (the Detail knob)', () => {
    // A far two-cell dense cluster (an aggregate) whose box, at a coarse
    // threshold, stays a single aggregate but at a fine threshold refines into
    // its two dense leaves — more (and childless) drawn nodes.
    const parent = mortonEncode3(50, 50, 50);
    const catalog = buildStarOctree(
      sortedStars([
        ...cellStars(0, STAR_LEAF_CAPACITY + 1),
        ...cellStars((parent << 3) | 0, STAR_LEAF_CAPACITY + 1),
        ...cellStars((parent << 3) | 1, STAR_LEAF_CAPACITY + 1),
      ]),
      GRID,
    );
    const cam: Vec3 = [0.5, 0.5, 0.5];

    const coarse = walkStarOctreeCut(catalog, cam, BIG, 0.05);
    const fine = walkStarOctreeCut(catalog, cam, BIG, 0.0005);

    const terminals = (draws: readonly { nodeIndex: number }[]) =>
      draws.filter((d) => catalog.nodes[d.nodeIndex]!.childMask === 0).length;

    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(terminals(fine)).toBeGreaterThan(terminals(coarse));
  });
});
