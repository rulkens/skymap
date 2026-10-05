/**
 * Choose, per frame, which octree nodes the star renderer draws: near cells
 * refined to real leaf stars, far/sub-pixel subtrees collapsed to a single
 * aggregate flux-mip, within a drawn-instance budget. Pure CPU — no GPU
 * state, no I/O — over a decoded `StarCatalog`; the layer turns the returned
 * cut into one instanced draw per stream.
 *
 * Descending the tree needs a `(childLevel, childMorton) → nodeIndex` lookup;
 * that resolution is lifted to load time in `starOctreeIndex` (see there),
 * so this walk reads only its flat typed arrays — O(1), no hashing, no
 * per-node allocation.
 *
 * NEAREST-FIRST, WITH A BUDGET: the camera-near stars subtend real screen
 * area, while a distant cluster smears into an unresolved glow a single point
 * can stand in for — so the cut refines the tree best-first by on-screen
 * size, spending the budget where the eye is before the far field runs out.
 * `typical` is the refinement target (steady-state working set); `hardCap` is
 * the inviolable ceiling a refine is refused past even for a near node, so
 * `Σ recordCount ≤ hardCap` always holds.
 *
 * COMMIT-AT-PUSH: routing every node through the heap would make ~85% of
 * pops on a full-budget cut an immediate commit (a leaf, or a sub-pixel box)
 * that does no refinement work but pays a push + pop + two sift passes.
 * Because *once a parent refines, every child is drawn* (the cut is a
 * covering partition, below), a non-refinable child has no budget decision
 * left, so the walk commits such a node the moment it is reached and pushes
 * only true refine CANDIDATES (childful AND above threshold) onto the heap.
 * Budget-gate order and the
 * running instance count are unchanged, so the cut is byte-identical to
 * routing every node through the heap — just far cheaper.
 *
 * OPTIONAL FRUSTUM CULL: given a `StarCutFrustum` (six planes PER VIEW), the
 * walk drops any node whose slack-grown bounding sphere is fully outside
 * EVERY view's frustum — pruning an interior
 * node drops its whole subtree unvisited, turning a ~44k-node star-field walk
 * into a ~12k one (roughly halving wall time). The slack is deliberately
 * loose (sized to the widest downstream footprint — the pick pass's 3.5px
 * floor and an aggregate's glow spread — see `buildStarCutFrustum`) so it can
 * never wrong-drop a node any consumer would still paint; the renderer's own
 * exact per-node cull stays the precise filter. `childCost` still sums ALL
 * present children (culled ones included), so a cull only removes nodes from
 * the emitted cut, never perturbs the budget arithmetic. `null` (the default)
 * disables it — byte-identical to the no-cull walk. One visible consequence:
 * a node pruned then rotated back into frame re-enters as an opacity-0
 * newcomer instead of popping in at 1 (see `docs/backlog/
 * 2026-09-20-star-cut-frustum-newcomer-seeding.md`).
 *
 * WHY AGGREGATES FOR THE FAR/SUB-PIXEL FIELD: each interior node carries one
 * flux-weighted centroid record standing in for its whole subtree — right
 * when the box is sub-pixel, one glow instead of thousands of leaf stars.
 * The refine/coarsen proxy (`edge² / distance²`, squared to skip a per-node
 * `Math.sqrt`) compares against `refineThreshold²`; the public
 * `refineThreshold` itself stays in LINEAR units for the settings slider.
 *
 * THE COVERING-PARTITION INVARIANT (load-bearing): the returned cut
 * represents every leaf star exactly once — by its own refined leaf draw, or
 * by exactly one ancestor aggregate — never both, never neither. This falls
 * out of the walk being a frontier (antichain) of the octree: descent
 * replaces a node by the complete set of its present children (`childMask`),
 * and each descent path terminates at a committed aggregate or a leaf
 * (childless — real stars, whether level-0 or a fat leaf merged above it,
 * which never refines further). Double-drawing or dropping a star is the bug
 * class the tests guard against. With a frustum cull active, the cut instead
 * covers the VISIBLE leaf stars only — a pruned subtree is neither refined
 * nor aggregated.
 *
 * OUTPUT — reused struct-of-arrays scratch (NON-REENTRANT): same GC-avoidance
 * rationale `StarNodeStream` states in full. The returned `StarCutSnapshot`
 * is a view over module-level grow-only arrays that the NEXT call
 * invalidates, so a consumer must read (or copy) what it needs before walking
 * again — safe because each per-source call fully completes before the next.
 */
import type { Vec3 } from '../../@types/math/Vec3';
import type { StarCatalog } from '../../@types/data/starCatalog/StarCatalog';
import type { StarCutSnapshot } from '../../layers/starCatalog/@types/StarCutSnapshot';
import type { StarCutFrustum } from '../../layers/starCatalog/@types/StarCutFrustum';
import { starOctreeIndex } from './starOctreeIndex';

/** Guards the `edge / distance` ratio when the camera sits inside a box. */
const MIN_DISTANCE_PC = 1e-6;
/** Squared guard, for the squared-proxy compare (see the header). */
const MIN_DISTANCE_PC_SQ = MIN_DISTANCE_PC * MIN_DISTANCE_PC;

export function walkStarOctreeCut(
  catalog: StarCatalog,
  camPosPc: Vec3,
  budget: { typical: number; hardCap: number },
  // The user's live "Detail" knob. LOWER threshold ⇒ boxes split earlier
  // (fewer visible far-aggregate seams) at the cost of more drawn nodes.
  // Squared once here to match the squared on-screen-size proxy. Required, so
  // this walk stays ignorant of the settings default that seeds the slider.
  refineThreshold: number,
  // `null` (default) disables the off-screen prune; see the header.
  frustum: StarCutFrustum | null = null,
): StarCutSnapshot {
  const n = catalog.nodes.length;
  if (n === 0) return emptySnapshot();

  const { childIndex, childMask, firstRecord, recordCount, boxOriginPc, boxEdgePc } =
    starOctreeIndex(catalog);
  const [camX, camY, camZ] = camPosPc;

  const refineThresholdSq = refineThreshold * refineThreshold;

  const heap = scratchHeap;
  heap.reset();

  cutCount = 0;

  // Records a node as a final draw. Never touches `instanceCount`: a
  // committed node's cost is already in the running total (added as the
  // root's own cost, or as a parent's `childCost` when that parent refined).
  const commit = (i: number): void => {
    if (cutCount >= cutNodeIndex.length) growCut(cutCount + 1);
    cutNodeIndex[cutCount] = i;
    cutFirstRecord[cutCount] = firstRecord[i]!;
    cutRecordCount[cutCount] = recordCount[i]!;
    cutCount++;
  };

  // True when node `i`'s slack-grown bounding sphere is outside the UNION of
  // the views' frusta. Hoisted so the `frustum === null` path pays nothing.
  const outsideFrustum = (i: number): boolean => {
    const planes = frustum!.planesPc;
    const edge = boxEdgePc[i]!;
    const o3 = i * 3;
    const cx = boxOriginPc[o3]! + edge * 0.5 - camX;
    const cy = boxOriginPc[o3 + 1]! + edge * 0.5 - camY;
    const cz = boxOriginPc[o3 + 2]! + edge * 0.5 - camZ;
    const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
    // Half-diagonal grown by aggregate world glow AND leaf angular spill —
    // conservative, only ever enlarges the sphere.
    const radius = edge * 0.8660254 * frustum!.worldSpread + dist * frustum!.angularMarginRad;
    const negR = -radius;
    // Outside the union: outside SOME plane of EVERY view. `planes.length` IS
    // the live view count × 24 — a `subarray`, not a grow-only buffer read past.
    for (let f = 0; f < planes.length; f += 24) {
      let outsideView = false;
      for (let b = f; b < f + 24; b += 4) {
        if (planes[b]! * cx + planes[b + 1]! * cy + planes[b + 2]! * cz + planes[b + 3]! < negR) {
          outsideView = true;
          break;
        }
      }
      if (!outsideView) return false;
    }
    return true;
  };

  // Off-screen box pruned outright; leaf or sub-pixel box commits
  // immediately (can never refine); only a childful, above-threshold
  // candidate enters the heap.
  const pushOrCommit = (i: number): void => {
    if (frustum !== null && outsideFrustum(i)) return;
    if (childMask[i] === 0) {
      commit(i);
      return;
    }
    const proxy = priorityOf(i, boxOriginPc, boxEdgePc, camX, camY, camZ);
    if (proxy < refineThresholdSq) {
      commit(i);
      return;
    }
    heap.push(i, proxy);
  };

  const rootIndex = n - 1; // layout invariant: root is the last node
  let instanceCount = recordCount[rootIndex]!;
  pushOrCommit(rootIndex);

  while (heap.size > 0) {
    const nodeIndex = heap.pop();
    // The heap holds only refine candidates, so the only decision left is
    // the budget: cost of replacing this aggregate with its present children.
    const cbase = nodeIndex * 8;
    let childCost = 0;
    for (let k = 0; k < 8; k++) {
      const c = childIndex[cbase + k]!;
      if (c < 0) continue;
      childCost += recordCount[c]!;
    }
    const refineDelta = childCost - recordCount[nodeIndex]!;

    const shouldRefine =
      instanceCount < budget.typical && instanceCount + refineDelta <= budget.hardCap;

    if (shouldRefine) {
      instanceCount += refineDelta;
      for (let k = 0; k < 8; k++) {
        const c = childIndex[cbase + k]!;
        if (c < 0) continue;
        pushOrCommit(c);
      }
    } else {
      commit(nodeIndex); // budget-limited: draw the subtree's single aggregate
    }
  }

  return {
    count: cutCount,
    nodeIndex: cutNodeIndex,
    firstRecord: cutFirstRecord,
    recordCount: cutRecordCount,
  };
}

/**
 * Refinement priority: SQUARED on-screen-size proxy `edgePc² / distanceToBox²`
 * (larger = refine sooner); 0 distance when the camera is inside the box.
 */
function priorityOf(
  i: number,
  boxOriginPc: Float64Array,
  boxEdgePc: Float64Array,
  camX: number,
  camY: number,
  camZ: number,
): number {
  const edgePc = boxEdgePc[i]!;
  const o3 = i * 3;

  let sq = 0;
  {
    const lo = boxOriginPc[o3]!;
    const hi = lo + edgePc;
    const d = camX < lo ? lo - camX : camX > hi ? camX - hi : 0;
    sq += d * d;
  }
  {
    const lo = boxOriginPc[o3 + 1]!;
    const hi = lo + edgePc;
    const d = camY < lo ? lo - camY : camY > hi ? camY - hi : 0;
    sq += d * d;
  }
  {
    const lo = boxOriginPc[o3 + 2]!;
    const hi = lo + edgePc;
    const d = camZ < lo ? lo - camZ : camZ > hi ? camZ - hi : 0;
    sq += d * d;
  }
  return (edgePc * edgePc) / Math.max(sq, MIN_DISTANCE_PC_SQ);
}

// Output SoA scratch, reused across calls (see the header's non-reentrancy).
let cutNodeIndex = new Int32Array(1024);
let cutFirstRecord = new Uint32Array(1024);
let cutRecordCount = new Uint32Array(1024);
let cutCount = 0;

/** Grow the output scratch (copying live contents) to hold at least `min` draws. */
function growCut(min: number): void {
  let cap = cutNodeIndex.length;
  while (cap < min) cap *= 2;
  const ni = new Int32Array(cap);
  ni.set(cutNodeIndex);
  cutNodeIndex = ni;
  const fr = new Uint32Array(cap);
  fr.set(cutFirstRecord);
  cutFirstRecord = fr;
  const rc = new Uint32Array(cap);
  rc.set(cutRecordCount);
  cutRecordCount = rc;
}

/** The empty cut (no nodes) — a view over the current scratch with `count` 0. */
function emptySnapshot(): StarCutSnapshot {
  cutCount = 0;
  return {
    count: 0,
    nodeIndex: cutNodeIndex,
    firstRecord: cutFirstRecord,
    recordCount: cutRecordCount,
  };
}

/**
 * Binary max-heap of node indices keyed by a float priority (best-first pop).
 * Holds only refine candidates (commit-at-push keeps leaves and sub-pixel
 * boxes out), so pop does not need to hand the priority back out.
 */
class MaxHeap {
  private readonly indices: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.indices.length;
  }

  reset(): void {
    this.indices.length = 0;
    this.priorities.length = 0;
  }

  push(nodeIndex: number, priority: number): void {
    this.indices.push(nodeIndex);
    this.priorities.push(priority);
    let i = this.indices.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent]! >= this.priorities[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.indices[0]!;
    const last = this.indices.length - 1;
    this.swap(0, last);
    this.indices.pop();
    this.priorities.pop();
    let i = 0;
    const n = this.indices.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let largest = i;
      if (left < n && this.priorities[left]! > this.priorities[largest]!) largest = left;
      if (right < n && this.priorities[right]! > this.priorities[largest]!) largest = right;
      if (largest === i) break;
      this.swap(i, largest);
      i = largest;
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.indices[a]!;
    this.indices[a] = this.indices[b]!;
    this.indices[b] = ti;
    const tp = this.priorities[a]!;
    this.priorities[a] = this.priorities[b]!;
    this.priorities[b] = tp;
  }
}

/** Reused across calls — the walk is synchronous and non-reentrant. */
const scratchHeap = new MaxHeap();
