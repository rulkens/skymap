import { describe, expect, it } from 'vitest';
import { nearestResolvableStar } from '../../../../src/services/engine/helpers/nearestResolvableStar';
import { resolveStarRecord } from '../../../../src/services/engine/helpers/resolveStarRecord';
import { buildStarOctree } from '../../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../../src/data/starCatalog/starCatalogFormat';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// A 1 pc leaf edge with a zero grid origin makes grid coordinates read directly
// as parsecs (a leaf cell's world box is `[mortonCoord, mortonCoord + 1) pc`),
// so the two-leaf geometry below is hand-reasoned in the same frame that
// `starNodeOriginRelCamMpc` reconstructs.
const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };
const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;

/** Ascending-Morton sort — buildStarOctree's precondition. */
function sorted(stars: OctreeLeafStar[]): OctreeLeafStar[] {
  return [...stars].sort((a, b) => a.mortonIndex - b.mortonIndex);
}

/**
 * A two-dense-core fixture, built through the REAL octree + encode/decode path,
 * whose two cores land as TWO SEPARATE, spatially-ADJACENT level-0 leaves — the
 * geometry the leaf-face edge case needs.
 *
 *   core A — 65 stars in leaf cell morton 0 = grid (0,0,0), box [0,1)³ pc
 *   core B — 65 stars in leaf cell morton 1 = grid (1,0,0), box [1,2)×[0,1)×[0,1)
 *
 * Both cells share the x = 1 pc face. Their common parent (morton 0 >> 3 = 0)
 * holds 130 > STAR_LEAF_CAPACITY stars, so it emits an AGGREGATE over its two
 * children instead of folding them into one fat leaf — which is exactly what
 * keeps the two cores as distinct leaves (a sparse pair would merge). Node order
 * (ascending level, morton):
 *
 *   (level0, morton0)  core A leaf   firstRecord 0,   recordCount 65 → records [0,65)
 *   (level0, morton1)  core B leaf   firstRecord 65,  recordCount 65 → records [65,130)
 *   (level1, morton0)  root aggregate firstRecord 130, recordCount 1
 *
 * Core A's stars sit near its x-high face (offset x = 1000/1024 ≈ 0.977 pc);
 * core B's sit near its x-low face (offset x = 100/1024 → world 1.098 pc). So a
 * camera parked JUST past the x = 1 partition (into B's box) is actually NEARER
 * to core A across the leaf face than to core B — the edge a "descend to the
 * leaf containing the camera" walk gets wrong.
 */
async function twoCoreCatalog() {
  const stars: OctreeLeafStar[] = [];
  for (let s = 0; s < 65; s++) {
    stars.push({ mortonIndex: 0, offset: [1000, 500, 500], absMag: 5, bpRp: 0.3 });
  }
  for (let s = 0; s < 65; s++) {
    stars.push({ mortonIndex: 1, offset: [100, 500, 500], absMag: 4, bpRp: 0.5 });
  }
  const octree = buildStarOctree(sorted(stars), GRID);
  return decodeStarCatalog(await encodeStarCatalog(octree));
}

/** Squared Mpc distance between two positions. */
function dist(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('nearestResolvableStar', () => {
  it('finds the star the camera sits on, at resolveStarRecord’s exact position', async () => {
    const cat = await twoCoreCatalog();
    const posA = resolveStarRecord(cat, 0)!.positionMpc;

    // Camera a whisker off core A; a generous search radius.
    const cam: Vec3 = [posA[0] + 1e-10, posA[1], posA[2]];
    const hit = nearestResolvableStar(cat, cam, 0.5 * PC_TO_MPC);

    expect(hit).not.toBeNull();
    // A core-A record, reconstructed to the SAME position resolveStarRecord gives.
    expect(hit!.recordIdx).toBeGreaterThanOrEqual(0);
    expect(hit!.recordIdx).toBeLessThan(65);
    for (const axis of [0, 1, 2]) {
      expect(hit!.positionMpc[axis]).toBeCloseTo(posA[axis]!, 18);
    }
    expect(hit!.distanceMpc).toBeCloseTo(1e-10, 18);
  });

  it('returns null when every star is beyond the search radius', async () => {
    const cat = await twoCoreCatalog();
    const posA = resolveStarRecord(cat, 0)!.positionMpc;
    // 10 pc away, searching only 1 pc — nothing in range.
    const cam: Vec3 = [posA[0] + 10 * PC_TO_MPC, posA[1], posA[2]];
    expect(nearestResolvableStar(cat, cam, 1 * PC_TO_MPC)).toBeNull();
  });

  it('returns the NEAREST of two in-range stars', async () => {
    const cat = await twoCoreCatalog();
    const posA = resolveStarRecord(cat, 0)!.positionMpc;
    const posB = resolveStarRecord(cat, 65)!.positionMpc;

    // Camera well inside core A's box (x = 0.9 pc), closer to A than B; a radius
    // that comfortably reaches both cores.
    const cam: Vec3 = [0.9 * PC_TO_MPC, posA[1], posA[2]];
    expect(dist(cam, posA)).toBeLessThan(dist(cam, posB)); // fixture sanity

    const hit = nearestResolvableStar(cat, cam, 1 * PC_TO_MPC);
    expect(hit).not.toBeNull();
    expect(hit!.recordIdx).toBeLessThan(65); // core A won
  });

  it('finds a star across a LEAF FACE — the expanded-box edge a naive descent misses', async () => {
    const cat = await twoCoreCatalog();
    const posA = resolveStarRecord(cat, 0)!.positionMpc;
    const posB = resolveStarRecord(cat, 65)!.positionMpc;

    // Camera parked just past the x = 1 pc partition, INSIDE core B's box, yet
    // physically NEARER to core A across the shared leaf face. A "descend to the
    // leaf containing the camera" walk lands in core B and never unpacks core A,
    // so it would return a core-B record (or null); the expanded-box descent
    // reaches core A and returns it.
    const cam: Vec3 = [1.02 * PC_TO_MPC, posA[1], posA[2]];
    expect(dist(cam, posA)).toBeLessThan(dist(cam, posB)); // A is genuinely nearer

    // Search radius (0.1 pc) exceeds the camera→core-B distance too, so a correct
    // nearest-search has BOTH cores as candidates and must still pick A.
    const hit = nearestResolvableStar(cat, cam, 0.1 * PC_TO_MPC);
    expect(hit).not.toBeNull();
    expect(hit!.recordIdx).toBeLessThan(65); // core A, found across the face
    for (const axis of [0, 1, 2]) {
      expect(hit!.positionMpc[axis]).toBeCloseTo(posA[axis]!, 18);
    }
  });
});
