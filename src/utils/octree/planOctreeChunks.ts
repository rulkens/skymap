/**
 * Walks the index, and on into resident chunks whose header lists chunks, with the cut's own tests:
 * frustum (every view's planes about `cut.originMpc`, the box grown as `cut.wesl`'s `offScreen`
 * grows a refine candidate) and the refine proxy edge²/dist² ≥ thr². A failing row is skipped with
 * its subtree, exactly: a child's proxy is ≤ ¼ its parent's and its sphere lies inside its
 * parent's; so is a row with no chunk root at or below it (`holdsChunkRoot`). A refining chunk root
 * requests its chunk (priority = its best root's proxy) when absent and is touched when resident,
 * so a chunk is only requested under a resident parent; the budget bin it cannot see may decline
 * a fetched chunk (bytes, never correctness). Only the best that fit the pool's slots, records and rows,
 * resident or not, are kept: the stream stamps touched chunks before allocating, so a weaker touched
 * resident would hold its run against a nearer chunk forever. A child ranks below its parent.
 */
import type { OctreeChunk } from '../../@types/octree/OctreeChunk';
import type { Octree } from '../../@types/octree/Octree';
import type { OctreeCutSpec } from '../../@types/octree/OctreeCutSpec';
import type { OctreeChunkPlan } from '../../@types/octree/OctreeChunkPlan';
import type { OctreeChunkRequest } from '../../@types/octree/OctreeChunkRequest';
import type { OctreePoolCapacity } from '../../@types/octree/OctreePoolCapacity';
import { OCTREE_FAMILIES } from '../../data/octree/octreeFamilies';
import { MAX_GRID_BITS, NO_CHUNK_REF, OCTANTS } from '../../data/octree/octreeFormat';
import {
  CUT_MAX_VIEWS,
  FLOATS_PER_VIEW,
  HALF_DIAGONAL,
  MIN_DIST_SQ,
  PLANE_FLOATS,
} from '../../services/gpu/octree/octreeCutLayout';
import { lowerBoundNodeRow } from './lowerBoundNodeRow';
import { octreeIndex } from './octreeIndex';

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
// Candidate positions (wanted, then touched) in rank order, and the kept chunks by id.
let order = new Int32Array(0);
let keep = new Uint8Array(0);
// Depth-first with all children pushed holds at most seven siblings per level plus the root,
// whichever objects the levels lie in.
const STACK_DEPTH = 1 + (OCTANTS - 1) * (MAX_GRID_BITS + 1);
const stack = new Int32Array(STACK_DEPTH);
const stackObject = new Int32Array(STACK_DEPTH);

export function planOctreeChunks(
  octree: Octree<{ readonly count: number }>,
  cut: OctreeCutSpec,
  resident: (id: number) => OctreeChunk<{ readonly count: number }> | null,
  hasFailed: (id: number) => boolean,
  pool: OctreePoolCapacity,
): OctreeChunkPlan {
  const chunks = octree.chunkCount;
  if (chunks === 0) return { requests: [], touched: [] };
  if (best.length < chunks) {
    best = new Float64Array(chunks);
    residentBest = new Float64Array(chunks);
    keep = new Uint8Array(chunks);
  } else for (const ref of written) best[ref] = residentBest[ref] = keep[ref] = 0;
  written.length = 0;

  // Scalars hoisted out of the loop, which runs every frame the eye moves.
  const { unitMpc } = OCTREE_FAMILIES[octree.family];
  const mpcToUnit = 1 / unitMpc;
  const cx = cut.originMpc[0] * mpcToUnit;
  const cy = cut.originMpc[1] * mpcToUnit;
  const cz = cut.originMpc[2] * mpcToUnit;
  const thrSq = cut.refineThreshold * cut.refineThreshold;
  // `MIN_DIST_SQ` is in leaf cells²; the plan measures in grid units.
  const minDistSq = MIN_DIST_SQ * octree.grid.cellEdge * octree.grid.cellEdge;
  const { planes } = cut;
  const planeFloats = planes.length <= CUT_MAX_VIEWS * FLOATS_PER_VIEW ? planes.length : 0;
  const radiusPerEdgeMpc = unitMpc * HALF_DIAGONAL * cut.worldSpread;
  const toMpc = unitMpc;
  // The object being walked; depth-first, it switches about twice per chunk walked into.
  let object = INDEX;
  let nodes = octree.nodes;
  let { boxOrigin, boxEdge, childIndex, holdsChunkRoot } = octreeIndex(nodes, octree.grid);

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
      ({ boxOrigin, boxEdge, childIndex, holdsChunkRoot } = octreeIndex(nodes, octree.grid));
    }
    const ref = nodes.chunkRef[i]!;
    const isChunkRoot = ref !== NO_CHUNK_REF;
    const seen = isChunkRoot ? best[ref]! : 0;
    if (seen === FAILED) continue;
    const edge = boxEdge[i]!;
    const lx = boxOrigin[i * AXES]! - cx;
    const ly = boxOrigin[i * AXES + 1]! - cy;
    const lz = boxOrigin[i * AXES + 2]! - cz;
    const dx = Math.max(lx, -(lx + edge), 0);
    const dy = Math.max(ly, -(ly + edge), 0);
    const dz = Math.max(lz, -(lz + edge), 0);
    const proxy = (edge * edge) / Math.max(dx * dx + dy * dy + dz * dz, minDistSq);
    // Below threshold, nothing under it refines; a weaker root of an already-wanted chunk
    // changes nothing.
    if (proxy < thrSq || proxy <= seen) continue;

    // Planes are camera-relative Mpc; the box centre is rebased the same way.
    const half = edge / 2;
    const x = (lx + half) * toMpc;
    const y = (ly + half) * toMpc;
    const z = (lz + half) * toMpc;
    const negRadius = -edge * radiusPerEdgeMpc;
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
      const holds = octreeIndex(c, octree.grid).holdsChunkRoot;
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

  // Strongest first, a tie to the resident chunk (no churn between equals); keep while the slots,
  // records and rows hold out. The first that overflows ends the set, so no child stays kept past a
  // parent the set left out.
  const ranks = wanted.length + touched.length;
  const idOf = (k: number) => (k < wanted.length ? wanted[k]! : touched[k - wanted.length]!);
  const proxyOf = (k: number) =>
    k < wanted.length ? best[wanted[k]!]! : residentBest[touched[k - wanted.length]!]!;
  if (order.length < ranks) order = new Int32Array(ranks);
  const ranked = order.subarray(0, ranks);
  for (let k = 0; k < ranks; k++) ranked[k] = k;
  ranked.sort((a, b) => proxyOf(b) - proxyOf(a) || b - a);
  let records = 0;
  let rows = 0;
  for (let k = 0; k < Math.min(ranks, pool.slots); k++) {
    const id = idOf(ranked[k]!);
    records += pool.runRecords(id);
    rows += pool.runNodes(id);
    if (records > pool.records || rows > pool.nodes) break;
    keep[id] = 1;
  }
  // Walk order kept: the stream relies on a parent preceding its children.
  const kept = touched.filter((ref) => keep[ref] === 1);
  const requests: OctreeChunkRequest[] = [];
  for (const ref of wanted)
    if (keep[ref] === 1) requests.push({ chunkRef: ref, priority: best[ref]! });
  requests.sort((a, b) => b.priority - a.priority);
  return { requests, touched: kept };
}
