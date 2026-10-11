/**
 * Walks the index from the root with the cut's own tests: frustum (every view's six planes,
 * `cut.planes`, rebased about `cut.originMpc`, the box grown as `cut.wesl`'s `offScreen` grows a
 * refine candidate) and the refine proxy edge²/dist² ≥ thr². A chunk root the walk would refine
 * requests its chunk (priority = its best root's proxy) when absent, touches it when resident.
 * The walk never enters a chunk. It cannot see the GPU's budget bin, so it may fetch a chunk the
 * budget then declines to open: bytes, never correctness. Only the `limit` best requests are
 * kept: a pool of `limit` slots can never fund more in one frame, and near the Sun hundreds of
 * roots want to refine.
 */
import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { StarCutSpec } from '../../layers/starCatalog/@types/StarCutSpec';
import type { StarOctreeIndex } from '../../layers/starCatalog/@types/StarOctreeIndex';
import type { StarChunkPlan } from '../../layers/starCatalog/@types/StarChunkPlan';
import type { StarChunkRequest } from '../../layers/starCatalog/@types/StarChunkRequest';
import { MAX_GRID_BITS, NO_CHUNK_REF, OCTANTS } from '../../data/octree/octreeFormat';
import { SCALE_UNITS } from '../../data/scaleUnits';
import {
  CUT_MAX_VIEWS,
  FLOATS_PER_VIEW,
  HALF_DIAGONAL,
  MIN_DIST_SQ,
  PLANE_FLOATS,
} from '../../layers/starCatalog/render/starCutLayout';

const AXES = 3;
// Depth-first with all children pushed holds at most seven siblings per level plus the root.
// Shared across calls: the walk is synchronous.
const stack = new Int32Array(1 + (OCTANTS - 1) * (MAX_GRID_BITS + 1));

export function planStarChunks(
  octree: StarOctree,
  index: StarOctreeIndex,
  cut: StarCutSpec,
  isResident: (chunkRef: number) => boolean,
  limit: number,
): StarChunkPlan {
  const { nodes } = octree;
  const requests: StarChunkRequest[] = [];
  const touched: number[] = [];
  if (nodes.count === 0) return { requests, touched };

  // Scalars hoisted out of the walk, which runs every frame the eye moves.
  const [cx, cy, cz] = cut.originMpc.map((v) => v * SCALE_UNITS.MPC_TO_PC) as [
    number,
    number,
    number,
  ];
  const thrSq = cut.refineThreshold * cut.refineThreshold;
  // `MIN_DIST_SQ` is in leaf cells²; the walk measures in parsecs.
  const minDistSqPc = MIN_DIST_SQ * octree.grid.cellEdge * octree.grid.cellEdge;
  const { planes } = cut;
  const views = planes.length / FLOATS_PER_VIEW;
  const planeFloats = views <= CUT_MAX_VIEWS ? planes.length : 0;
  const radiusPerEdgePc = SCALE_UNITS.PC_TO_MPC * HALF_DIAGONAL * cut.worldSpread;
  const { boxOriginPc, boxEdgePc, childIndex } = index;
  const { childMask, chunkRef } = nodes;

  // Planes are camera-relative Mpc; the box centre is rebased the same way.
  const offScreen = (x: number, y: number, z: number, edgePc: number): boolean => {
    if (planeFloats === 0) return false;
    const radius = edgePc * radiusPerEdgePc;
    for (let v = 0; v < planeFloats; v += FLOATS_PER_VIEW) {
      let outside = false;
      for (let p = v; p < v + FLOATS_PER_VIEW; p += PLANE_FLOATS) {
        if (planes[p]! * x + planes[p + 1]! * y + planes[p + 2]! * z + planes[p + 3]! < -radius) {
          outside = true;
          break;
        }
      }
      if (!outside) return false;
    }
    return true;
  };

  // Kept in descending priority, at most `limit` long. A chunk with several roots is offered
  // once per root and keeps its best root's priority: a repeat would fund it twice.
  const offer = (chunkRef: number, priority: number): void => {
    if (requests.length === limit && !(priority > requests[limit - 1]!.priority)) return;
    for (let k = 0; k < requests.length; k++) {
      if (requests[k]!.chunkRef !== chunkRef) continue;
      if (requests[k]!.priority >= priority) return;
      requests.splice(k, 1);
      break;
    }
    let at = requests.length;
    while (at > 0 && requests[at - 1]!.priority < priority) at--;
    requests.splice(at, 0, { chunkRef, priority });
    if (requests.length > limit) requests.pop();
  };

  let top = 0;
  stack[top++] = nodes.count - 1;
  while (top > 0) {
    const i = stack[--top]!;
    if (childMask[i] === 0) continue;
    const edgePc = boxEdgePc[i]!;
    const lx = boxOriginPc[i * AXES]! - cx;
    const ly = boxOriginPc[i * AXES + 1]! - cy;
    const lz = boxOriginPc[i * AXES + 2]! - cz;
    const dx = Math.max(lx, -(lx + edgePc), 0);
    const dy = Math.max(ly, -(ly + edgePc), 0);
    const dz = Math.max(lz, -(lz + edgePc), 0);
    const proxy = (edgePc * edgePc) / Math.max(dx * dx + dy * dy + dz * dz, minDistSqPc);
    if (proxy < thrSq) continue;
    const half = edgePc / 2;
    const toMpc = SCALE_UNITS.PC_TO_MPC;
    if (offScreen((lx + half) * toMpc, (ly + half) * toMpc, (lz + half) * toMpc, edgePc)) continue;

    const ref = chunkRef[i]!;
    if (ref !== NO_CHUNK_REF) {
      if (isResident(ref)) touched.push(ref);
      else offer(ref, proxy);
      continue;
    }
    for (let k = 0; k < OCTANTS; k++) {
      const child = childIndex[i * OCTANTS + k]!;
      if (child >= 0) stack[top++] = child;
    }
  }
  return { requests, touched };
}
