/**
 * walkStarOctreeCut — choose, per frame, which octree nodes the star renderer
 * draws: near cells refined to their real leaf stars, far/sub-pixel subtrees
 * collapsed to a single aggregate flux-mip, all within a drawn-instance budget.
 *
 * This is the pure CPU heart of the star renderer. It takes a decoded
 * `StarCatalog` (the octree the `.bin` format serializes) plus the camera and a
 * budget, and returns a flat list of draws — one contiguous record-buffer slice
 * per chosen node. It touches no GPU state and does no I/O; the renderer turns
 * the returned `StarNodeDraw[]` into instanced draw calls.
 *
 * ── The load-time-index / per-frame-walk split (was the dominant cost) ──────
 *
 * Descending the tree needs a `(childLevel, childMorton) → nodeIndex` lookup:
 * the Morton layout names *where* a child sits, not its array slot. This walk
 * used to rebuild that mapping as a fresh `Map` on *every call* — ~300k
 * `Map.set` inserts per frame on the large tier (one per node), plus a hashed
 * `Map.get` per descent step. That per-call rebuild dominated the walk's cost
 * (the "N1" finding). It is a pure function of the immutable node table, so it
 * now lives at load time in `starOctreeIndex`, which resolves every child link
 * once into a flat `childIndex[nodeIdx*8 + octant]` array (`-1` for absent) and
 * lifts the box geometry + scalar node fields into parallel typed arrays. The
 * per-frame walk here reads only those typed arrays and scalar locals — O(1)
 * array reads, no hashing, no object property chains, no per-node allocation.
 * The refinement heap is reused across calls (module-level scratch; see below).
 *
 * ── Why nearest-first, and why a budget ────────────────────────────────────
 *
 * The Gaia catalog holds far more stars than can be drawn every frame, and the
 * ones that matter are the ones near the camera — they subtend real screen
 * area, while a distant cluster of thousands of stars smears into an
 * unresolved glow a single point can stand in for. So the cut refines the tree
 * *best-first by on-screen size*: it always spends its next refinement on the
 * node that currently looms largest, so when the drawn-instance budget runs
 * out the detail has already been laid down where the eye is, and only the far
 * field stays coarse. A naive depth-first walk would instead pour the whole
 * budget into whichever subtree it happened to enter first.
 *
 * Two budget knobs shape the spend. `typical` is the refinement *target*: once
 * the running instance count reaches it, refinement stops and every remaining
 * frontier node is drawn coarse — this is the steady-state working set. `hardCap`
 * is the inviolable ceiling: a refinement that would push the instance count
 * past it is refused even for a near node, so `Σ recordCount ≤ hardCap` always
 * holds (barring a degenerate single-leaf catalog whose one unavoidable leaf
 * already exceeds the cap). Task 13 tunes both knobs and the threshold below
 * against live frame timing.
 *
 * ── Why aggregates for the far / sub-pixel field ───────────────────────────
 *
 * Each interior node carries one flux-weighted centroid record (`recordCount
 * === 1`) that is the whole subtree's light collapsed to a point — see
 * `buildStarOctree`'s flux-merge. Drawing that single record instead of the
 * subtree's thousands of leaf stars is exactly right when the box is smaller
 * than a pixel: the summed flux lands one glow where the cluster is, at a
 * cost of one instance instead of thousands. The refine/coarsen decision here
 * uses a distance-per-box-edge proxy for that on-screen size — a node is
 * refined only while its box edge subtends more than `REFINE_ANGULAR_THRESHOLD`
 * relative to its distance (`edgePc / distancePc`). It is a proxy, not a true
 * pixel error, because this pure function is given no viewport or field of
 * view; Task 13 swaps in a viewport-accurate screen-error metric behind the
 * same refine predicate.
 *
 * The node's on-screen-size proxy is its `edge/distance` ratio — the very same
 * value that keys the best-first heap. So it is computed *once*, when the node
 * is pushed onto the heap, and carried back out on pop (the heap returns the
 * priority alongside the index). The main loop reuses that value as its refine
 * `angularSize` instead of recomputing `distanceToBox` a second time per node.
 *
 * ── The covering-partition invariant (load-bearing) ────────────────────────
 *
 * The returned draws are a *covering partition* of the catalog's leaf stars:
 * every leaf star is represented exactly once — either by its own refined leaf
 * draw, or by exactly one ancestor aggregate that stands in for its whole
 * subtree — never by both, never by neither. This falls out of the walk being
 * a frontier (antichain) of the octree that covers the root: descent replaces a
 * node by the complete set of its present children (`childMask` names every
 * populated octant), and each descent path terminates either at a committed
 * aggregate or at a leaf — a childless node whose records are real stars,
 * whether a level-0 finest cell or a fat leaf merged above level 0. A fat leaf
 * never refines (it has no children), so it is drawn as-is exactly like a
 * level-0 leaf. Double-drawing a star (an ancestor *and* its descendant both
 * drawn) or dropping one (a subtree neither refined nor aggregated) is the bug
 * class the tests guard against.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import { starOctreeIndex } from './starOctreeIndex';

/**
 * One instanced draw the cut selected: a contiguous slice of the catalog's
 * record buffer. A leaf draw's `recordCount` is its cell's real star count; an
 * aggregate draw's is always 1 (its single flux-mip record).
 */
export type StarNodeDraw = {
  /** Index into `catalog.nodes` of the chosen node. */
  readonly nodeIndex: number;
  /** Base offset into the record buffer for this draw (`node.firstRecord`). */
  readonly firstRecord: number;
  /** Instance count: leaf → N stars in the cell; aggregate → 1. */
  readonly recordCount: number;
};

/**
 * Default refine threshold — seeds `settings.starCatalogs.refineThreshold` (the
 * "Detail" slider) and is the fallback when `walkStarOctreeCut` is called with
 * no explicit threshold. A node refines while its box edge subtends more than
 * this fraction of its distance (`edgePc / distancePc > threshold`) — a
 * dimensionless distance-per-box-edge proxy for on-screen angle (radians-ish;
 * small-angle `edge/distance ≈ tan(angle) ≈ angle`). Below it the box is treated
 * as sub-pixel and drawn as one aggregate. 0.16 ≈ a box refines once it would
 * subtend more than ~9°, keeping every drawn aggregate visually small so the
 * octree's box lattice stays invisible instead of showing through as
 * faceted seams. That trades more draw calls (more refined nodes at a given
 * distance) for far-field continuity — it's the eye-tuning knob for that
 * trade, not a physical constant. With the flux-glow shader the *photometry*
 * of a coarse aggregate is already correct at any threshold (it's the
 * subtree's summed flux); what a threshold this loose exposes is the
 * *structure* — the aggregate's box edge itself becomes a visible seam
 * before it's small enough to read as a point. Task 13 replaces the proxy
 * with a viewport-accurate screen-error metric behind the same predicate.
 *
 * 0.16 was eye-tuned together with `DEFAULT_STAR_GLOW_OVERLAP` (1.0 → 4.0),
 * not in isolation: the two knobs compensate for each other. A coarser cut
 * (higher threshold) collapses more of the far field into aggregates —
 * fewer drawn nodes, cheaper frame — but leaves bigger, more visible box
 * seams; the wider glow overlap then smooths those seams away. Retuning one
 * without the other reintroduces either a visible lattice (glow too narrow
 * for this coarse a cut) or a soft, aggregate-count-heavy far field (cut too
 * fine for this wide a glow) — check both together.
 */
export const DEFAULT_REFINE_THRESHOLD = 0.16;

/** Guards the `edge / distance` ratio when the camera sits inside a box. */
const MIN_DISTANCE_PC = 1e-6;

export function walkStarOctreeCut(
  catalog: StarCatalog,
  camPosPc: Vec3,
  budget: { typical: number; hardCap: number },
  // The user's live "Detail" knob (`settings.starCatalogs.refineThreshold`).
  // LOWER threshold ⇒ a box passes the `angularSize >= threshold` gate at a
  // greater distance ⇒ boxes SPLIT EARLIER ⇒ fewer far aggregates whose box
  // edge reads as a visible lattice cell, at the cost of MORE drawn nodes
  // (deeper refinement everywhere). Defaults to the documented tuning above so
  // callers that don't expose the knob (tests) keep the old behaviour.
  refineThreshold: number = DEFAULT_REFINE_THRESHOLD,
): readonly StarNodeDraw[] {
  const n = catalog.nodes.length;
  if (n === 0) return [];

  // The load-time index: flat child links + box geometry + scalar node fields,
  // all in typed arrays (built once per catalog, memoised). The hot loop below
  // reads only these arrays — no Map, no object property chains.
  const { childIndex, firstRecord, recordCount, boxOriginPc, boxEdgePc } =
    starOctreeIndex(catalog);
  const [camX, camY, camZ] = camPosPc;

  // ── Best-first frontier: a max-heap keyed by on-screen size ───────────────
  // Refinement always advances the largest-on-screen node, so budget is spent
  // nearest-first. `instanceCount` tracks Σ recordCount over the current draw
  // set (frontier nodes + committed nodes drawn as-is); refining a node swaps
  // its own cost for its children's, keeping the count exact so the final total
  // is known before the walk ends.
  const heap = scratchHeap;
  heap.reset();
  const committed: StarNodeDraw[] = [];

  const rootIndex = n - 1; // layout invariant: root is the last node
  let instanceCount = recordCount[rootIndex]!;
  heap.push(rootIndex, priorityOf(rootIndex, boxOriginPc, boxEdgePc, camX, camY, camZ));

  while (heap.size > 0) {
    const nodeIndex = heap.pop();
    // The `edge/distance` proxy computed when this node was pushed — the same
    // value the refine gate needs, so it is NOT recomputed here (no second
    // `distanceToBox`). For a leaf it is unused.
    const angularSize = heap.poppedPriority;

    // Cost of replacing this node (an aggregate, recordCount 1) with its present
    // children drawn as-is (leaf children add their full star count).
    const cbase = nodeIndex * 8;
    let childCost = 0;
    let childCount = 0;
    for (let k = 0; k < 8; k++) {
      const c = childIndex[cbase + k]!;
      if (c < 0) continue;
      childCost += recordCount[c]!;
      childCount++;
    }

    // A childless node is a LEAF — its records are real stars, so it cannot be
    // refined; draw it as-is. This is the terminal case at ANY level: a level-0
    // finest cell OR a fat leaf (a sparse subtree merged into one node above
    // level 0). The discriminant is the absence of children, never the octree
    // level — a fat leaf sits at level > 0 yet is a leaf. Its recordCount is
    // already in instanceCount (added as the root's own cost or a parent's
    // childCost when it was refined).
    if (childCount === 0) {
      committed.push({
        nodeIndex,
        firstRecord: firstRecord[nodeIndex]!,
        recordCount: recordCount[nodeIndex]!,
      });
      continue;
    }

    const refineDelta = childCost - recordCount[nodeIndex]!;

    const shouldRefine =
      angularSize >= refineThreshold && // near/large enough to resolve
      instanceCount < budget.typical && // refinement target not yet reached
      instanceCount + refineDelta <= budget.hardCap; // stays under the ceiling

    if (shouldRefine) {
      instanceCount += refineDelta;
      for (let k = 0; k < 8; k++) {
        const c = childIndex[cbase + k]!;
        if (c < 0) continue;
        heap.push(c, priorityOf(c, boxOriginPc, boxEdgePc, camX, camY, camZ));
      }
    } else {
      // Far, sub-pixel, or budget-limited: draw the subtree's single aggregate.
      committed.push({
        nodeIndex,
        firstRecord: firstRecord[nodeIndex]!,
        recordCount: recordCount[nodeIndex]!,
      });
    }
  }

  return committed;
}

/**
 * Refinement priority: a node's on-screen-size proxy `edgePc / distanceToBox`,
 * larger = refine sooner. Reads the box geometry from the load-time index's
 * typed arrays; the distance to the axis-aligned box is 0 when the camera is
 * inside it. This is the ONLY place `distanceToBox` runs — the value is carried
 * through the heap to the refine gate (see the header's "computed once" note).
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

  // Euclidean distance in parsecs from the camera to the node's box (0 inside).
  // The box origin is `gridOrigin + gridCoords · edgePc`, baked at load time.
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
  const distPc = Math.sqrt(sq);
  return edgePc / Math.max(distPc, MIN_DISTANCE_PC);
}

/**
 * A binary max-heap of node indices keyed by a float priority. Best-first
 * refinement pops the largest-on-screen node next; a heap keeps that O(log n)
 * instead of an O(n) scan of the frontier each step. `pop` also exposes the
 * popped node's priority via `poppedPriority`, so the caller reuses the
 * on-screen-size proxy it was keyed by without recomputing it.
 */
class MaxHeap {
  private readonly indices: number[] = [];
  private readonly priorities: number[] = [];
  /** Priority of the node returned by the most recent `pop` (m7: carried out). */
  poppedPriority = 0;

  get size(): number {
    return this.indices.length;
  }

  /** Drop all entries, keeping the backing arrays' capacity for reuse. */
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
    this.poppedPriority = this.priorities[0]!;
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

/**
 * The best-first refinement heap, reused across calls. The walk is synchronous
 * and non-reentrant (each per-source call fully completes before the next), so a
 * single module-level heap is safe and skips reallocating its two backing arrays
 * every frame — `reset()` keeps their capacity. It stores `(nodeIndex, priority)`
 * pairs so a popped node carries its already-computed on-screen-size proxy.
 */
const scratchHeap = new MaxHeap();
