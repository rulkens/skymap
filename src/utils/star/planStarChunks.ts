/**
 * Walks the index, and on into resident chunks whose header lists chunks, with the cut's own tests:
 * frustum (every view's planes about `cut.originMpc`, the box grown as `cut.wesl`'s `offScreen`
 * grows a refine candidate) and the refine proxy edge²/dist² ≥ thr². A failing row is skipped with
 * its subtree, exactly: a child's proxy is ≤ ¼ its parent's and its sphere lies inside its
 * parent's; so is a row with no chunk root at or below it (`holdsChunkRoot`). A refining chunk root
 * requests its chunk (priority = its best root's proxy) when absent and is touched when resident,
 * so a chunk is only requested under a resident parent; the budget bin it cannot see may decline
 * a fetched chunk (bytes, never correctness). Only the `limit` best, resident or not, are kept: the
 * stream stamps touched chunks before allocating, so a weaker touched resident would hold its slot
 * against a nearer chunk forever. A child ranks below its parent, so the kept set keeps parents.
 */
import type { StarChunk } from '../../@types/data/starCatalog/StarChunk';
import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { StarCutSpec } from '../../layers/starCatalog/@types/StarCutSpec';
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
import { lowerBoundNodeRow } from '../octree/lowerBoundNodeRow';
import { starOctreeIndex } from './starOctreeIndex';

const AXES = 3;
// Per chunk, this plan: 0 unseen, TOUCHED (resident, walked into), FAILED, else its best root's
// proxy (> 0). Shared across calls: the plan is synchronous. `written` lists the ids set since
// the last reset, so a plan clears what it saw, not the whole catalog.
let best = new Float64Array(0);
// A TOUCHED chunk's best root proxy, so it ranks against the wanted ones.
let residentBest = new Float64Array(0);
const written: number[] = [];
const TOUCHED = -1;
const FAILED = -2;
/** A stack entry's object: the index, else a resident chunk's id. */
const INDEX = -1;
// The ranked chunks' proxies, sorted natively to find the `limit`-th best without sorting objects.
let ranked = new Float64Array(0);
// Depth-first with all children pushed holds at most seven siblings per level plus the root,
// whichever objects the levels lie in.
const STACK_DEPTH = 1 + (OCTANTS - 1) * (MAX_GRID_BITS + 1);
const stack = new Int32Array(STACK_DEPTH);
const stackObject = new Int32Array(STACK_DEPTH);

export function planStarChunks(
  octree: StarOctree,
  cut: StarCutSpec,
  resident: (id: number) => StarChunk | null,
  hasFailed: (id: number) => boolean,
  limit: number,
): StarChunkPlan {
  const chunks = octree.chunkCount;
  if (chunks === 0) return { requests: [], touched: [] };
  if (best.length < chunks) {
    best = new Float64Array(chunks);
    residentBest = new Float64Array(chunks);
  } else for (const ref of written) best[ref] = residentBest[ref] = 0;
  written.length = 0;

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
  // The object being walked; depth-first, it switches about twice per chunk walked into.
  let object = INDEX;
  let nodes = octree.nodes;
  let { boxOriginPc, boxEdgePc, childIndex, holdsChunkRoot } = starOctreeIndex(nodes, octree.grid);

  const touched: number[] = [];
  const wanted: number[] = [];
  let top = 0;
  stack[top] = nodes.count - 1;
  stackObject[top++] = INDEX;
  walk: while (top > 0) {
    const i = stack[--top]!;
    if (stackObject[top] !== object) {
      object = stackObject[top]!;
      nodes = object === INDEX ? octree.nodes : resident(object)!.nodes;
      ({ boxOriginPc, boxEdgePc, childIndex, holdsChunkRoot } = starOctreeIndex(
        nodes,
        octree.grid,
      ));
    }
    const ref = nodes.chunkRef[i]!;
    const isChunkRoot = ref !== NO_CHUNK_REF;
    const seen = isChunkRoot ? best[ref]! : 0;
    if (seen === FAILED) continue;
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
        if (child < 0 || holdsChunkRoot[child] === 0) continue;
        stack[top] = child;
        stackObject[top++] = object;
      }
      continue;
    }

    // A chunk with several roots is touched or requested once, at its best root's proxy; a
    // resident one is walked into under every root that passes.
    if (seen > 0) {
      best[ref] = proxy;
      continue;
    }
    const chunk = resident(ref);
    if (chunk !== null) {
      if (seen !== TOUCHED) {
        best[ref] = TOUCHED;
        written.push(ref);
        touched.push(ref);
      }
      residentBest[ref] = Math.max(residentBest[ref]!, proxy);
      // Only a chunk whose header lists chunks has rows worth walking. The root's children are
      // its rows one level down under the root's key, adjacent in (level, morton) order.
      if (chunk.chunks.length === 0) continue;
      const c = chunk.nodes;
      const holds = starOctreeIndex(c, octree.grid).holdsChunkRoot;
      const level = nodes.level[i]! - 1;
      const first = nodes.morton[i]! * OCTANTS;
      const end = lowerBoundNodeRow(c, level, first + OCTANTS);
      for (let k = lowerBoundNodeRow(c, level, first); k < end; k++) {
        if (holds[k] === 0) continue;
        stack[top] = k;
        stackObject[top++] = ref;
      }
    } else {
      written.push(ref);
      if (hasFailed(ref)) best[ref] = FAILED;
      else {
        best[ref] = proxy;
        wanted.push(ref);
      }
    }
  }

  let floor = 0;
  const ranks = wanted.length + touched.length;
  if (ranks > limit) {
    if (ranked.length < ranks) ranked = new Float64Array(ranks);
    for (let k = 0; k < wanted.length; k++) ranked[k] = best[wanted[k]!]!;
    for (let k = 0; k < touched.length; k++) ranked[wanted.length + k] = residentBest[touched[k]!]!;
    floor = ranked.subarray(0, ranks).sort()[ranks - limit]!;
  }
  // Walk order kept: the stream relies on a parent preceding its children.
  const kept = touched.filter((ref) => residentBest[ref]! >= floor);
  const requests: StarChunkRequest[] = [];
  for (const ref of wanted) {
    const priority = best[ref]!;
    if (priority >= floor) requests.push({ chunkRef: ref, priority });
  }
  requests.sort((a, b) => b.priority - a.priority);
  // A tie at the floor goes to the resident chunk: no churn between equals.
  requests.length = Math.min(requests.length, Math.max(0, limit - kept.length));
  return { requests, touched: kept };
}
