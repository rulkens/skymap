/**
 * Walks the index from its root with the cut's own tests: frustum (every view's six planes,
 * `cut.planes`, rebased about `cut.originMpc`, the box grown as `cut.wesl`'s `offScreen` grows a
 * refine candidate) and the refine proxy edge²/dist² ≥ thr². A row that fails either is skipped
 * with its whole subtree, exactly: a child's proxy is ≤ ¼ its parent's, and, as `worldSpread` ≥ 1,
 * its sphere lies inside its parent's. So the cost follows the visible, refining rows, not the
 * catalog. A chunk root that would refine requests its chunk (priority = its best root's proxy)
 * when absent, touches it when resident. The plan cannot see the GPU's budget bin, so it may fetch
 * a chunk the budget then declines to open: bytes, never correctness. A failed chunk asks for
 * nothing. Only the `limit` best requests are kept.
 */
import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { StarCutSpec } from '../../layers/starCatalog/@types/StarCutSpec';
import type { StarOctreeIndex } from '../../layers/starCatalog/@types/StarOctreeIndex';
import type { StarChunkPlan } from '../../layers/starCatalog/@types/StarChunkPlan';
import type { StarChunkRequest } from '../../layers/starCatalog/@types/StarChunkRequest';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { MAX_GRID_BITS, NO_CHUNK_REF, OCTANTS } from '../../data/octree/octreeFormat';
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
// Depth-first with all children pushed holds at most seven siblings per level plus the root.
const stack = new Int32Array(1 + (OCTANTS - 1) * (MAX_GRID_BITS + 1));

export function planStarChunks(
  octree: StarOctree,
  index: StarOctreeIndex,
  cut: StarCutSpec,
  isResident: (chunkRef: number) => boolean,
  hasFailed: (chunkRef: number) => boolean,
  limit: number,
): StarChunkPlan {
  const chunks = octree.chunks.length;
  if (chunks === 0) return { requests: [], touched: [] };
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
  const { boxOriginPc, boxEdgePc, childIndex } = index;
  const { chunkRef, childMask, count: rows } = octree.nodes;

  const touched: number[] = [];
  const wanted: number[] = [];
  let top = 0;
  stack[top++] = rows - 1;
  walk: while (top > 0) {
    const i = stack[--top]!;
    // A childless row holds no chunk and nothing below it.
    if (childMask[i] === 0) continue;
    const ref = chunkRef[i]!;
    const isChunkRoot = ref !== NO_CHUNK_REF;
    const seen = isChunkRoot ? best[ref]! : 0;
    if (seen === SEEN) continue;
    const edgePc = boxEdgePc[i]!;
    const lx = boxOriginPc[i * AXES]! - cx;
    const ly = boxOriginPc[i * AXES + 1]! - cy;
    const lz = boxOriginPc[i * AXES + 2]! - cz;
    const dx = Math.max(lx, -(lx + edgePc), 0);
    const dy = Math.max(ly, -(ly + edgePc), 0);
    const dz = Math.max(lz, -(lz + edgePc), 0);
    const proxy = (edgePc * edgePc) / Math.max(dx * dx + dy * dy + dz * dz, minDistSqPc);
    // Below threshold, nothing under it refines; a weaker root of an already-wanted chunk
    // changes nothing.
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
      if (v + FLOATS_PER_VIEW === planeFloats) continue walk;
    }

    if (!isChunkRoot) {
      for (let k = 0; k < OCTANTS; k++) {
        const child = childIndex[i * OCTANTS + k]!;
        if (child >= 0) stack[top++] = child;
      }
      continue;
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
