/**
 * nearestResolvableStar — the nearest catalogued field star within a small
 * (~AU-scale) world radius of the camera, reconstructed to the EXACT position
 * the sprite/pick names it at. This is the presence query behind the close-range
 * field-star sphere: at solar-radius range the Gaia point sprite is
 * distance-retired in-shader (its f32 reconstruction swims), so the sphere is the
 * star's only geometry — and WHICH star gets a sphere is a fact about proximity,
 * not about selection.
 *
 * ── Why an expanded-box octree descent, not "the leaf containing the camera" ──
 *
 * The obvious query — descend to the leaf whose box contains the camera, scan
 * its records — is WRONG at a leaf face. A star can sit within the (AU-scale)
 * search radius of the camera yet across a leaf boundary from it: the camera
 * lands in leaf B while the nearest star lives in the adjacent leaf A, a
 * fraction of a cell away. Scanning only B's records misses A entirely.
 *
 * So this descends every node whose box, EXPANDED by the search radius on each
 * axis, still contains the camera (a per-axis interval test). That admits a
 * neighbour leaf exactly when a star in it could be within range, and no
 * farther. The descent is an explicit stack (no per-node closures on the hot
 * path).
 *
 * ── Why reconstruct through the SHARED starNodeOriginRelCamMpc formula ────────
 *
 * A leaf's records are reconstructed to world Mpc EXACTLY the way
 * `resolveStarRecord` does — `starNodeOriginRelCamMpc(grid, morton, level, SUN)`
 * for the node's heliocentric origin, plus the record's offset scaled by the
 * box. Sharing that one formula is what guarantees the sphere lands where the
 * sprite drew and where the pick resolves; a second derivation off the index's
 * box arrays could drift and place the sphere off the star.
 *
 * ── Why it is cheap enough to run every frame ─────────────────────────────────
 *
 * The search radius is ~an AU, so away from any star the descent dies almost
 * immediately: the root box contains the camera (you are inside the catalog
 * volume), but its CHILDREN thin out — only the handful whose expanded boxes
 * still straddle the camera are pushed, and one level down almost none do. The
 * walk therefore touches ~O(tree height) nodes near the camera, not the whole
 * tree, and unpacks records only at the one-or-two leaves that actually
 * neighbour the camera. All math is plain f64 JS numbers.
 */
import type { Vec3 } from '../../../@types/math/Vec3';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import { OFFSET_FRACTION_LEVELS } from '../../../data/octree/octreeFormat';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { starOctreeIndex } from '../../../utils/star/starOctreeIndex';
import { starNodeOriginRelCamMpc } from '../../../utils/star/starNodeOriginRelCamMpc';

/** Heliocentric camera position — the reconstruction wants the world origin. */
const SUN: Vec3 = [0, 0, 0];

/**
 * The nearest catalogued star whose heliocentric position lies within
 * `searchRadiusMpc` of `camPosMpc`, or null if none. `recordIdx` is the
 * bin-global record index (what the pick names and `resolveStarRecord` resolves);
 * `positionMpc` and `bpRp` are the reconstructed star; `distanceMpc` is the
 * camera-to-star distance (≤ `searchRadiusMpc`).
 */
export function nearestResolvableStar(
  octree: StarOctree,
  camPosMpc: Readonly<Vec3>,
  searchRadiusMpc: number,
): { recordIdx: number; positionMpc: Vec3; bpRp: number; distanceMpc: number } | null {
  const { nodes, records } = octree;
  const n = nodes.count;
  if (n === 0) return null;

  const { childIndex, boxOriginPc, boxEdgePc } = starOctreeIndex(nodes, octree.grid);

  // The expanded-box containment test runs in parsecs (the box arrays' unit); the
  // nearest-record compare runs in Mpc (the reconstruction's unit).
  const camXPc = camPosMpc[0] * SCALE_UNITS.MPC_TO_PC;
  const camYPc = camPosMpc[1] * SCALE_UNITS.MPC_TO_PC;
  const camZPc = camPosMpc[2] * SCALE_UNITS.MPC_TO_PC;
  const radiusPc = searchRadiusMpc * SCALE_UNITS.MPC_TO_PC;

  const radiusSqMpc = searchRadiusMpc * searchRadiusMpc;
  let bestSqMpc = radiusSqMpc;
  let bestIdx = -1;
  let bestPos: Vec3 | null = null;
  let bestBpRp = 0;

  // Explicit descent stack of node indices — root last per the layout invariant.
  const stack: number[] = [n - 1];
  while (stack.length > 0) {
    const i = stack.pop()!;

    // Reject a node whose box, grown by the search radius on every axis, does not
    // contain the camera — no record inside it can be within range.
    const o3 = i * 3;
    const edge = boxEdgePc[i]!;
    const loX = boxOriginPc[o3]! - radiusPc;
    const hiX = boxOriginPc[o3]! + edge + radiusPc;
    if (camXPc < loX || camXPc > hiX) continue;
    const loY = boxOriginPc[o3 + 1]! - radiusPc;
    const hiY = boxOriginPc[o3 + 1]! + edge + radiusPc;
    if (camYPc < loY || camYPc > hiY) continue;
    const loZ = boxOriginPc[o3 + 2]! - radiusPc;
    const hiZ = boxOriginPc[o3 + 2]! + edge + radiusPc;
    if (camZPc < loZ || camZPc > hiZ) continue;

    // Childful: descend into every present child (a blob is a flux mip, never unpacked).
    if (nodes.childMask[i] !== 0) {
      const cbase = i * 8;
      for (let k = 0; k < 8; k++) {
        const c = childIndex[cbase + k]!;
        if (c >= 0) stack.push(c);
      }
    }

    // Own records ARE real stars, reconstructed as resolveStarRecord does.
    const count = nodes.ownCount[i]!;
    if (count === 0) continue;
    const { originRelCamMpc, cellScaleMpc } = starNodeOriginRelCamMpc(
      octree.grid,
      nodes.morton[i]!,
      nodes.level[i]!,
      SUN,
    );
    const base = nodes.firstRecord[i]!;
    for (let r = 0; r < count; r++) {
      const recordIdx = base + r;
      const o = 3 * recordIdx;
      const px = originRelCamMpc[0] + (records.offset[o]! / OFFSET_FRACTION_LEVELS) * cellScaleMpc;
      const py =
        originRelCamMpc[1] + (records.offset[o + 1]! / OFFSET_FRACTION_LEVELS) * cellScaleMpc;
      const pz =
        originRelCamMpc[2] + (records.offset[o + 2]! / OFFSET_FRACTION_LEVELS) * cellScaleMpc;
      const dx = px - camPosMpc[0];
      const dy = py - camPosMpc[1];
      const dz = pz - camPosMpc[2];
      const sq = dx * dx + dy * dy + dz * dz;
      if (sq <= bestSqMpc) {
        bestSqMpc = sq;
        bestIdx = recordIdx;
        bestPos = [px, py, pz];
        bestBpRp = records.colourIndex[recordIdx]!;
      }
    }
  }

  if (bestIdx < 0 || bestPos === null) return null;
  return {
    recordIdx: bestIdx,
    positionMpc: bestPos,
    bpRp: bestBpRp,
    distanceMpc: Math.sqrt(bestSqMpc),
  };
}
