/**
 * Walks the index from the root with the cut's own tests: frustum (every
 * view's six planes, `cut.planes`, rebased about `cut.originMpc`, the box grown
 * as `cut.wesl`'s `offScreen` grows a refine candidate) and the refine proxy
 * edge²/dist² ≥ thr². A chunk root the walk would refine is a request
 * (priority = proxy) when absent, touched when resident. The walk never enters
 * a chunk. It cannot see the GPU's budget bin, so it may fetch a chunk the
 * budget then declines to open: bytes, never correctness.
 */
import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { StarCutSpec } from '../../layers/starCatalog/@types/StarCutSpec';
import type { StarOctreeIndex } from '../../layers/starCatalog/@types/StarOctreeIndex';
import type { StarChunkPlan } from '../../layers/starCatalog/@types/StarChunkPlan';
import type { StarChunkRequest } from '../../layers/starCatalog/@types/StarChunkRequest';
import { NO_CHUNK_REF } from '../../data/octree/octreeFormat';
import { SCALE_UNITS } from '../../data/scaleUnits';
import {
  CUT_MAX_VIEWS,
  FLOATS_PER_VIEW,
  HALF_DIAGONAL,
  MIN_DIST_SQ,
} from '../../layers/starCatalog/render/starCutLayout';

const OCTANTS = 8;
const AXES = 3;
const PLANE_FLOATS = 4;

export function planStarChunks(
  octree: StarOctree,
  index: StarOctreeIndex,
  cut: StarCutSpec,
  isResident: (chunkRef: number) => boolean,
): StarChunkPlan {
  const { nodes } = octree;
  const requests: StarChunkRequest[] = [];
  const touched: number[] = [];
  if (nodes.count === 0) return { requests, touched };

  const camPc = cut.originMpc.map((v) => v * SCALE_UNITS.MPC_TO_PC);
  const thrSq = cut.refineThreshold * cut.refineThreshold;
  // `MIN_DIST_SQ` is in leaf cells²; the walk measures in parsecs.
  const minDistSqPc = MIN_DIST_SQ * octree.grid.cellEdge * octree.grid.cellEdge;
  const views = cut.planes.length / FLOATS_PER_VIEW;
  const viewCount = views <= CUT_MAX_VIEWS ? views : 0;

  const offScreen = (i: number, edgePc: number): boolean => {
    if (viewCount === 0) return false;
    const center = [0, 0, 0];
    for (let a = 0; a < AXES; a++) {
      center[a] =
        (index.boxOriginPc[i * AXES + a]! + edgePc / 2 - camPc[a]!) * SCALE_UNITS.PC_TO_MPC;
    }
    const radius = edgePc * SCALE_UNITS.PC_TO_MPC * HALF_DIAGONAL * cut.worldSpread;
    for (let v = 0; v < viewCount; v++) {
      let outside = false;
      for (let p = v * FLOATS_PER_VIEW; p < (v + 1) * FLOATS_PER_VIEW; p += PLANE_FLOATS) {
        const { planes } = cut;
        const d =
          planes[p]! * center[0]! + planes[p + 1]! * center[1]! + planes[p + 2]! * center[2]!;
        if (d + planes[p + 3]! < -radius) {
          outside = true;
          break;
        }
      }
      if (!outside) return false;
    }
    return true;
  };

  const stack = [nodes.count - 1];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (nodes.childMask[i] === 0) continue;
    const edgePc = index.boxEdgePc[i]!;
    let distSq = 0;
    for (let a = 0; a < AXES; a++) {
      const lo = index.boxOriginPc[i * AXES + a]! - camPc[a]!;
      const d = Math.max(lo, -(lo + edgePc), 0);
      distSq += d * d;
    }
    const proxy = (edgePc * edgePc) / Math.max(distSq, minDistSqPc);
    if (proxy < thrSq || offScreen(i, edgePc)) continue;

    const ref = nodes.chunkRef[i]!;
    if (ref !== NO_CHUNK_REF) {
      if (isResident(ref)) touched.push(ref);
      else requests.push({ chunkRef: ref, priority: proxy });
      continue;
    }
    for (let k = 0; k < OCTANTS; k++) {
      const child = index.childIndex[i * OCTANTS + k]!;
      if (child >= 0) stack.push(child);
    }
  }
  requests.sort((a, b) => b.priority - a.priority);
  return { requests, touched };
}
