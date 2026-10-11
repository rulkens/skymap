/**
 * Tests every chunk root with the cut's own tests: frustum (every view's six planes, `cut.planes`,
 * rebased about `cut.originMpc`, the box grown as `cut.wesl`'s `offScreen` grows a refine
 * candidate) and the refine proxy edge²/dist² ≥ thr². Roots alone decide what a walk from the
 * index root would: an ancestor box holds the root's with twice the edge (proxy ≥ 4× the root's)
 * and, as `worldSpread` ≥ 1, a sphere holding the root's. A root that would refine requests its
 * chunk (priority = its best root's proxy) when absent, touches it when resident. The plan cannot
 * see the GPU's budget bin, so it may fetch a chunk the budget then declines to open: bytes, never
 * correctness. A failed chunk asks for nothing. Only the `limit` best requests are kept.
 */
import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { StarCutSpec } from '../../layers/starCatalog/@types/StarCutSpec';
import type { StarOctreeIndex } from '../../layers/starCatalog/@types/StarOctreeIndex';
import type { StarChunkPlan } from '../../layers/starCatalog/@types/StarChunkPlan';
import type { StarChunkRequest } from '../../layers/starCatalog/@types/StarChunkRequest';
import { SCALE_UNITS } from '../../data/scaleUnits';
import {
  CUT_MAX_VIEWS,
  FLOATS_PER_VIEW,
  HALF_DIAGONAL,
  MIN_DIST_SQ,
  PLANE_FLOATS,
} from '../../layers/starCatalog/render/starCutLayout';

const AXES = 3;
// Per chunk, this plan: 0 unseen, SEEN once touched or failed, else its best root's proxy (> 0).
// Shared across calls: the plan is synchronous.
let best = new Float64Array(0);
const SEEN = -1;
// The wanted chunks' proxies, sorted natively to find the `limit`-th best without sorting objects.
let ranked = new Float64Array(0);

export function planStarChunks(
  octree: StarOctree,
  index: StarOctreeIndex,
  cut: StarCutSpec,
  isResident: (chunkRef: number) => boolean,
  hasFailed: (chunkRef: number) => boolean,
  limit: number,
): StarChunkPlan {
  const chunks = octree.chunks.length;
  if (best.length < chunks) {
    best = new Float64Array(chunks);
    ranked = new Float64Array(chunks);
  } else best.fill(0, 0, chunks);

  // Scalars hoisted out of the loop, which runs every frame the eye moves.
  const cx = cut.originMpc[0] * SCALE_UNITS.MPC_TO_PC;
  const cy = cut.originMpc[1] * SCALE_UNITS.MPC_TO_PC;
  const cz = cut.originMpc[2] * SCALE_UNITS.MPC_TO_PC;
  const thrSq = cut.refineThreshold * cut.refineThreshold;
  // `MIN_DIST_SQ` is in leaf cells²; the plan measures in parsecs.
  const minDistSqPc = MIN_DIST_SQ * octree.grid.cellEdge * octree.grid.cellEdge;
  const { planes } = cut;
  const planeFloats = planes.length <= CUT_MAX_VIEWS * FLOATS_PER_VIEW ? planes.length : 0;
  const radiusPerEdgeMpc = SCALE_UNITS.PC_TO_MPC * HALF_DIAGONAL * cut.worldSpread;
  const toMpc = SCALE_UNITS.PC_TO_MPC;
  const { boxOriginPc, boxEdgePc, chunkRoots } = index;
  const { chunkRef } = octree.nodes;

  const touched: number[] = [];
  const wanted: number[] = [];
  roots: for (let r = 0; r < chunkRoots.length; r++) {
    const i = chunkRoots[r]!;
    const ref = chunkRef[i]!;
    const seen = best[ref]!;
    if (seen === SEEN) continue;
    const edgePc = boxEdgePc[i]!;
    const lx = boxOriginPc[i * AXES]! - cx;
    const ly = boxOriginPc[i * AXES + 1]! - cy;
    const lz = boxOriginPc[i * AXES + 2]! - cz;
    const dx = Math.max(lx, -(lx + edgePc), 0);
    const dy = Math.max(ly, -(ly + edgePc), 0);
    const dz = Math.max(lz, -(lz + edgePc), 0);
    const proxy = (edgePc * edgePc) / Math.max(dx * dx + dy * dy + dz * dz, minDistSqPc);
    // A weaker root of an already-wanted chunk changes nothing, seen or not.
    if (proxy < thrSq || proxy <= seen) continue;

    // Planes are camera-relative Mpc; the box centre is rebased the same way.
    const half = edgePc / 2;
    const x = (lx + half) * toMpc;
    const y = (ly + half) * toMpc;
    const z = (lz + half) * toMpc;
    const negRadius = -edgePc * radiusPerEdgeMpc;
    for (let v = 0; v < planeFloats; v += FLOATS_PER_VIEW) {
      let p = v;
      while (p < v + FLOATS_PER_VIEW) {
        if (planes[p]! * x + planes[p + 1]! * y + planes[p + 2]! * z + planes[p + 3]! < negRadius)
          break;
        p += PLANE_FLOATS;
      }
      if (p === v + FLOATS_PER_VIEW) break;
      if (v + FLOATS_PER_VIEW === planeFloats) continue roots;
    }

    // A chunk with several roots is touched or requested once, at its best root's proxy.
    if (seen > 0) best[ref] = proxy;
    else if (isResident(ref)) {
      best[ref] = SEEN;
      touched.push(ref);
    } else if (hasFailed(ref)) best[ref] = SEEN;
    else {
      best[ref] = proxy;
      wanted.push(ref);
    }
  }

  let floor = 0;
  if (wanted.length > limit) {
    for (let k = 0; k < wanted.length; k++) ranked[k] = best[wanted[k]!]!;
    floor = ranked.subarray(0, wanted.length).sort()[wanted.length - limit]!;
  }
  const requests: StarChunkRequest[] = [];
  for (const ref of wanted) {
    const priority = best[ref]!;
    if (priority >= floor) requests.push({ chunkRef: ref, priority });
  }
  requests.sort((a, b) => b.priority - a.priority);
  if (requests.length > limit) requests.length = limit;
  return { requests, touched };
}
