/**
 * nearestResolvableStar — the nearest catalogued field star within a small (~AU) radius of the
 * camera, at the exact position the sprite and pick name it: at that range the point sprite is
 * retired, so this picks which star gets the close-range sphere. The descent enters every node
 * whose box, grown by the radius on each axis, contains the camera: the nearest star can sit
 * across a leaf face from the camera's own leaf. Records are placed through
 * `octreeNodeOriginRelCamMpc`, the formula `resolveStarRecord` and the renderer use, so the
 * sphere lands where the sprite drew.
 */
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeResidency } from '../../../@types/octree/OctreeResidency';
import type { StarColumns } from '../../../@types/data/starCatalog/StarColumns';
import type { OctreeNodeTable } from '../../../@types/octree/OctreeNodeTable';
import { NO_CHUNK_REF, OCTANTS, OFFSET_FRACTION_LEVELS } from '../../../data/octree/octreeFormat';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { octreeIndex } from '../../../utils/octree/octreeIndex';
import { lowerBoundNodeRow } from '../../../utils/octree/lowerBoundNodeRow';
import { octreeNodeOriginRelCamMpc } from '../../../utils/octree/octreeNodeOriginRelCamMpc';

/** Heliocentric camera position — the reconstruction wants the world origin. */
const SUN: Vec3 = [0, 0, 0];

/**
 * The nearest catalogued star whose heliocentric position lies within
 * `searchRadiusMpc` of `camPosMpc`, or null if none. `ordinal` is the
 * catalog record ordinal (what `resolveStarRecord` resolves); `positionMpc`
 * and `bpRp` are the reconstructed star; `distanceMpc` is the camera-to-star
 * distance (≤ `searchRadiusMpc`). The descent continues into a chunk only while
 * it is resident: an absent chunk's stars are not drawn either.
 */
export function nearestResolvableStar(
  octree: Octree<StarColumns>,
  resident: OctreeResidency<StarColumns>,
  camPosMpc: Readonly<Vec3>,
  searchRadiusMpc: number,
): { ordinal: number; positionMpc: Vec3; bpRp: number; distanceMpc: number } | null {
  const n = octree.nodes.count;
  if (n === 0) return null;

  // The expanded-box containment test runs in parsecs (the box arrays' unit); the
  // nearest-record compare runs in Mpc (the reconstruction's unit).
  const camXPc = camPosMpc[0] * SCALE_UNITS.MPC_TO_PC;
  const camYPc = camPosMpc[1] * SCALE_UNITS.MPC_TO_PC;
  const camZPc = camPosMpc[2] * SCALE_UNITS.MPC_TO_PC;
  const radiusPc = searchRadiusMpc * SCALE_UNITS.MPC_TO_PC;

  let bestSqMpc = searchRadiusMpc * searchRadiusMpc;
  let bestOrdinal = -1;
  let bestPos: Vec3 | null = null;
  let bestBpRp = 0;

  /**
   * Descend one object (the index, or a chunk) from rows `[from, to)`; its record `r` is ordinal
   * `ordinalBase + r`.
   */
  function scan(
    nodes: OctreeNodeTable,
    records: StarColumns,
    from: number,
    to: number,
    ordinalBase: number,
  ): void {
    const { childIndex, boxOrigin, boxEdge } = octreeIndex(nodes, octree.grid);
    const stack: number[] = [];
    for (let k = from; k < to; k++) stack.push(k);
    while (stack.length > 0) {
      const i = stack.pop()!;

      // Reject a node whose box, grown by the search radius on every axis, does not
      // contain the camera — no record inside it can be within range.
      const o3 = i * 3;
      const edge = boxEdge[i]!;
      const loX = boxOrigin[o3]! - radiusPc;
      const hiX = boxOrigin[o3]! + edge + radiusPc;
      if (camXPc < loX || camXPc > hiX) continue;
      const loY = boxOrigin[o3 + 1]! - radiusPc;
      const hiY = boxOrigin[o3 + 1]! + edge + radiusPc;
      if (camYPc < loY || camYPc > hiY) continue;
      const loZ = boxOrigin[o3 + 2]! - radiusPc;
      const hiZ = boxOrigin[o3 + 2]! + edge + radiusPc;
      if (camZPc < loZ || camZPc > hiZ) continue;

      // Childful: descend into every present child (a blob is a flux mip, never
      // unpacked); a chunk root's children are the chunk's rows one level down
      // under its key. A chunk holds several roots, maybe at several levels.
      if (nodes.childMask[i] !== 0) {
        const ref = nodes.chunkRef[i]!;
        const chunk = ref === NO_CHUNK_REF ? null : resident.chunk(ref);
        if (chunk !== null) {
          const c = chunk.nodes;
          const level = nodes.level[i]! - 1;
          const first = nodes.morton[i]! * OCTANTS;
          const from = lowerBoundNodeRow(c, level, first);
          scan(
            c,
            chunk.records,
            from,
            lowerBoundNodeRow(c, level, first + OCTANTS),
            chunk.ref.recordBase,
          );
        }
        const cbase = i * OCTANTS;
        for (let k = 0; k < OCTANTS; k++) {
          const c = childIndex[cbase + k]!;
          if (c >= 0) stack.push(c);
        }
      }

      // Own records ARE real stars (hoisted ones included), reconstructed as resolveStarRecord does.
      const count = nodes.ownCount[i]!;
      if (count === 0) continue;
      const { originRelCamMpc, cellScaleMpc } = octreeNodeOriginRelCamMpc(
        octree.grid,
        octree.family,
        nodes.morton[i]!,
        nodes.level[i]!,
        SUN,
      );
      const base = nodes.firstRecord[i]!;
      for (let r = base; r < base + count; r++) {
        const o = 3 * r;
        const px =
          originRelCamMpc[0] + (records.offset[o]! / OFFSET_FRACTION_LEVELS) * cellScaleMpc;
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
          bestOrdinal = ordinalBase + r;
          bestPos = [px, py, pz];
          bestBpRp = records.colourIndex[r]!;
        }
      }
    }
  }

  // Root last per the layout invariant.
  scan(octree.nodes, octree.records, n - 1, n, 0);

  if (bestOrdinal < 0 || bestPos === null) return null;
  return {
    ordinal: bestOrdinal,
    positionMpc: bestPos,
    bpRp: bestBpRp,
    distanceMpc: Math.sqrt(bestSqMpc),
  };
}
