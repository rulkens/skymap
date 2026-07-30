/**
 * walkStarOctreeCut — choose, per frame, which octree nodes the star renderer
 * draws: near cells refined to their real leaf stars, far/sub-pixel subtrees
 * collapsed to a single aggregate flux-mip, all within a drawn-instance budget.
 *
 * This is the pure CPU heart of the star renderer. It takes a decoded
 * `StarCatalog` (the octree the `.bin` format serializes) plus the camera and a
 * budget, and returns a flat cut — one contiguous record-buffer slice per chosen
 * node. It touches no GPU state and does no I/O; the layer turns the returned cut
 * into a single instanced draw.
 *
 * ── The load-time-index / per-frame-walk split ─────────────────────────────
 *
 * Descending the tree needs a `(childLevel, childMorton) → nodeIndex` lookup:
 * the Morton layout names *where* a child sits, not its array slot. That mapping
 * is a pure function of the immutable node table, so it lives at load time in
 * `starOctreeIndex`, which resolves every child link once into a flat
 * `childIndex[nodeIdx*8 + octant]` array (`-1` for absent) and lifts the box
 * geometry + scalar node fields into parallel typed arrays. The per-frame walk
 * here reads only those typed arrays and scalar locals — O(1) array reads, no
 * hashing, no object property chains, no per-node allocation.
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
 * already exceeds the cap).
 *
 * ── Commit-at-push: only refine CANDIDATES transit the heap ─────────────────
 *
 * The heap is the cut's dominant cost, and most of what used to pass through it
 * never refined: on a full budget the cut commits tens of thousands of nodes,
 * and ~85% of pops were immediate commits (a leaf, or a sub-pixel box) that did
 * no work but a push + pop + two sift passes. That round trip is pure overhead,
 * because *once a parent refines, every child is drawn* — the cut is a covering
 * partition (below), so a non-refinable child has no budget decision left to
 * make. A child is non-refinable when it is a leaf (childless — its records are
 * real stars) or its on-screen-size proxy is below the refine threshold
 * (sub-pixel — drawn as one aggregate regardless of budget). So the walk
 * *commits such a node the moment it is reached* and pushes only the true refine
 * CANDIDATES — childful AND above threshold — onto the heap. The root gets the
 * same classification before the loop. The budget gates are untouched: they
 * govern only whether a popped candidate actually refines, and they read the
 * same running instance count in the same order (commits never change it), so
 * the cut is byte-identical to routing every node through the heap — just far
 * cheaper.
 *
 * ── Optional frustum cull: prune off-screen subtrees during descent ────────
 *
 * Given a `StarCutFrustum` (six camera-relative parsec-space planes plus a
 * conservative slack model), the walk drops any node whose slack-grown bounding
 * sphere is fully outside the frustum — and because a parent box geometrically
 * encloses every descendant box, dropping an interior node prunes its WHOLE
 * subtree unvisited. That is the win: at a star-field pose most of the cut's
 * nodes are off-screen, and pruning them at their common ancestor turns a ~44k
 * node walk into a ~12k one and roughly halves the walk's wall time (measured on
 * the large tier with the pick-safe slack this cull actually ships — a looser,
 * unsafe slack would prune more but wink-drop visible aggregate glow). The cull
 * is a COARSE pre-filter: its
 * slack is deliberately loose (sized to cover the widest downstream footprint —
 * the pick pass's 3.5px clickable floor and an aggregate's glow spread — so it
 * can never wrong-drop a node any consumer would still paint), and the exact
 * per-node cull the renderer already runs stays the precise filter. Passing
 * `null` (the default) disables it and the walk is byte-identical to before, so
 * the covering-partition tests and every non-frustum caller are unaffected.
 *
 * The budget arithmetic is unchanged: `childCost` still sums ALL present
 * children (culled ones included), so a refine that survives the cull is charged
 * exactly as before — the cull only removes nodes from the emitted cut, never
 * perturbs the running instance count. That keeps the budget conservative (a
 * pruned subtree's cost is still reserved) at the cost of leaving some refinement
 * headroom on the table; spending the freed budget on the visible field is a
 * follow-up, deliberately out of this change's scope.
 *
 * With a cull active the returned cut is a covering partition of the VISIBLE
 * leaf stars — a pruned subtree is neither refined nor aggregated. One
 * consumer-visible consequence lives in the LOD-fade layer, not here: a node
 * that rotates back into the frustum re-enters the cut as a newcomer (opacity 0)
 * and fades in over `NODE_FADE_MS`, where before it was already in the cut and
 * popped in instantly when the renderer's exact cull stopped dropping it. See
 * `starCatalogLayer`'s frustum note.
 *
 * ── Why aggregates for the far / sub-pixel field ───────────────────────────
 *
 * Each interior node carries one flux-weighted centroid record (`recordCount
 * === 1`) that is the whole subtree's light collapsed to a point. Drawing that
 * single record instead of the subtree's thousands of leaf stars is exactly
 * right when the box is smaller than a pixel: the summed flux lands one glow
 * where the cluster is, at a cost of one instance instead of thousands. The
 * refine/coarsen decision uses a distance-per-box-edge proxy for on-screen size:
 * a node refines only while its box edge subtends more than `refineThreshold`
 * relative to its distance. That proxy is compared in SQUARED form — the walk
 * orders and gates by `edge² / distance²` and squares `refineThreshold` once at
 * the start, so the hot `priorityOf` avoids a `Math.sqrt` per node. Both sides
 * are positive, so squaring preserves the heap order and the gate outcome
 * exactly; the public `refineThreshold` stays in LINEAR units for the settings
 * slider.
 *
 * ── The covering-partition invariant (load-bearing) ────────────────────────
 *
 * The returned cut is a *covering partition* of the catalog's leaf stars:
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
 *
 * ── Output: a reused struct-of-arrays snapshot (NON-REENTRANT) ─────────────
 *
 * A full-budget cut is tens of thousands of draws, so returning an array of
 * `{ nodeIndex, firstRecord, recordCount }` objects allocated tens of thousands
 * of short-lived objects every frame. Instead the walk fills three grow-only
 * module-level typed arrays and returns a `StarCutSnapshot` view over them
 * (`count` valid entries). The buffers are REUSED across calls, so a snapshot is
 * INVALIDATED by the next `walkStarOctreeCut` call — a consumer must read (or
 * copy out) the entries it needs before walking again. This mirrors the
 * synchronous, non-reentrant contract the scratch heap already relies on: each
 * per-source call fully completes (and the layer copies the cut into its fade
 * bookkeeping) before the next call starts.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import { starOctreeIndex } from './starOctreeIndex';

/**
 * One instanced draw the cut selected: a contiguous slice of the catalog's
 * record buffer. A leaf draw's `recordCount` is its cell's real star count; an
 * aggregate draw's is always 1 (its single flux-mip record). This is the shape
 * the layer's per-node draw list carries; the walk itself returns the parallel
 * `StarCutSnapshot` below.
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
 * The per-frame cut as a struct-of-arrays view over the walk's reused scratch:
 * `count` valid draws, each described by index `i ∈ [0, count)` of the three
 * parallel arrays. The arrays are the full grow-only capacity — read only the
 * first `count` — and are INVALIDATED by the next `walkStarOctreeCut` call.
 */
export type StarCutSnapshot = {
  /** Number of valid draws — only `[0, count)` of the arrays below are live. */
  readonly count: number;
  /** Per-draw node index (`catalog.nodes` slot). */
  readonly nodeIndex: Int32Array;
  /** Per-draw record-slice base (`node.firstRecord`). */
  readonly firstRecord: Uint32Array;
  /** Per-draw instance count (leaf → N stars; aggregate → 1). */
  readonly recordCount: Uint32Array;
};

/**
 * The frustum-cull descriptor the walk prunes off-screen subtrees with. All in
 * the CAMERA-RELATIVE PARSEC frame the walk already works in (box centre =
 * `boxOriginPc + edge/2 − camPc`), so the cull needs no unit conversion inside
 * the hot loop — the layer bakes the scene-unit → parsec scale into `planesPc`'s
 * distance term once (see `starCatalogLayer`).
 *
 * The slack is intentionally generous — this is a coarse pre-filter that must
 * never wrong-drop a node any downstream consumer would still paint, with the
 * renderer's exact per-node cull the precise filter:
 *   - `angularMarginRad`: a leaf draws as a fixed-PIXEL dot, so its world spill
 *     grows with distance; the cull sphere gains `dist · angularMarginRad`.
 *     Sized to the PICK footprint (the 3.5px clickable floor ≥ the visual glow),
 *     so a pick recompute of the same cut never drops a clickable edge star.
 *   - `worldSpread`: an aggregate fills its box footprint with glow that spreads
 *     with the dot-size/overlap scale — a WORLD slack, applied as a multiplier on
 *     the box half-diagonal (`≥ 1`).
 * A subtree holds both species, so the sphere grows by BOTH terms (their sum ≥
 * either alone) — over-keeping is free, a false drop is forbidden.
 */
export type StarCutFrustum = {
  /**
   * Six unit-normalized `(nx, ny, nz, d)` planes in the camera-relative parsec
   * frame — 24 floats, inside is `n·p + d ≥ 0`. The layer derives these from the
   * NEAR0 rebased vp and scales the distance term into parsecs.
   */
  readonly planesPc: Float64Array;
  /** Leaf angular slack, radians of on-screen spill per parsec of distance. */
  readonly angularMarginRad: number;
  /** Aggregate glow spread as a half-diagonal multiplier (`≥ 1`). */
  readonly worldSpread: number;
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
 * before it's small enough to read as a point.
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
/** Squared guard, for the squared-proxy compare (see the header). */
const MIN_DISTANCE_PC_SQ = MIN_DISTANCE_PC * MIN_DISTANCE_PC;

export function walkStarOctreeCut(
  catalog: StarCatalog,
  camPosPc: Vec3,
  budget: { typical: number; hardCap: number },
  // The user's live "Detail" knob (`settings.starCatalogs.refineThreshold`).
  // LOWER threshold ⇒ a box passes the refine gate at a greater distance ⇒
  // boxes SPLIT EARLIER ⇒ fewer far aggregates whose box edge reads as a visible
  // lattice cell, at the cost of MORE drawn nodes (deeper refinement
  // everywhere). Defaults to the documented tuning above so callers that don't
  // expose the knob (tests) keep the old behaviour. Stays in LINEAR units; it is
  // squared once here to match the squared on-screen-size proxy.
  refineThreshold: number = DEFAULT_REFINE_THRESHOLD,
  // Optional off-screen prune (see `StarCutFrustum` + the header). `null` (the
  // default) disables it: the walk is then byte-identical to the no-cull era, so
  // the covering-partition tests and every caller that passes no frustum are
  // unaffected. When present, off-screen subtrees are dropped at their common
  // ancestor and the cut covers the VISIBLE leaf stars only.
  frustum: StarCutFrustum | null = null,
): StarCutSnapshot {
  const n = catalog.nodes.length;
  if (n === 0) return emptySnapshot();

  // The load-time index: flat child links + box geometry + scalar node fields,
  // all in typed arrays (built once per catalog, memoised). The hot loop below
  // reads only these arrays — no Map, no object property chains.
  const { childIndex, childMask, firstRecord, recordCount, boxOriginPc, boxEdgePc } =
    starOctreeIndex(catalog);
  const [camX, camY, camZ] = camPosPc;

  // Squared threshold: `priorityOf` returns `edge² / distance²`, so the linear
  // gate `edge/distance ≥ threshold` becomes `proxy ≥ threshold²`. Both sides
  // positive, so this is the identical outcome without the per-node sqrt.
  const refineThresholdSq = refineThreshold * refineThreshold;

  const heap = scratchHeap;
  heap.reset();

  // Reset the output SoA scratch; `commit` appends into it (growing as needed).
  cutCount = 0;

  // `commit` records a node as a final draw. It never touches `instanceCount`:
  // a committed node's cost is already in the running total (added as the root's
  // own cost, or as a parent's `childCost` when that parent refined). So which
  // nodes commit — and in what order — cannot perturb the budget arithmetic.
  const commit = (i: number): void => {
    if (cutCount >= cutNodeIndex.length) growCut(cutCount + 1);
    cutNodeIndex[cutCount] = i;
    cutFirstRecord[cutCount] = firstRecord[i]!;
    cutRecordCount[cutCount] = recordCount[i]!;
    cutCount++;
  };

  // Off-screen prune: true when node `i`'s slack-grown bounding sphere is fully
  // outside a frustum plane. Reached only when a frustum is supplied; hoisted so
  // the `frustum === null` fast path pays nothing. Box centre + slack are all in
  // the camera-relative parsec frame (see `StarCutFrustum`).
  const outsideFrustum = (i: number): boolean => {
    const planes = frustum!.planesPc;
    const edge = boxEdgePc[i]!;
    const o3 = i * 3;
    const cx = boxOriginPc[o3]! + edge * 0.5 - camX;
    const cy = boxOriginPc[o3 + 1]! + edge * 0.5 - camY;
    const cz = boxOriginPc[o3 + 2]! + edge * 0.5 - camZ;
    const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
    // Half-diagonal grown by aggregate world glow (worldSpread) AND leaf angular
    // spill (dist · angularMarginRad) — the sum covers whichever species the
    // subtree holds. Conservative: this only ever enlarges the sphere.
    const radius = edge * 0.8660254 * frustum!.worldSpread + dist * frustum!.angularMarginRad;
    const negR = -radius;
    for (let b = 0; b < 24; b += 4) {
      if (planes[b]! * cx + planes[b + 1]! * cy + planes[b + 2]! * cz + planes[b + 3]! < negR)
        return true;
    }
    return false;
  };

  // Classify a node the walk has reached: an off-screen box is pruned outright
  // (its whole subtree with it); otherwise a leaf (childless) or a sub-pixel box
  // commits immediately (it can never refine — see the header's commit-at-push);
  // only a childful, above-threshold refine CANDIDATE enters the heap.
  const pushOrCommit = (i: number): void => {
    if (frustum !== null && outsideFrustum(i)) return; // off-screen — prune subtree
    if (childMask[i] === 0) {
      commit(i); // leaf (level-0 cell OR fat leaf) — records are real stars
      return;
    }
    const proxy = priorityOf(i, boxOriginPc, boxEdgePc, camX, camY, camZ);
    if (proxy < refineThresholdSq) {
      commit(i); // sub-pixel box → one aggregate, regardless of budget
      return;
    }
    heap.push(i, proxy); // refine candidate: childful AND above threshold
  };

  const rootIndex = n - 1; // layout invariant: root is the last node
  let instanceCount = recordCount[rootIndex]!;
  pushOrCommit(rootIndex);

  while (heap.size > 0) {
    const nodeIndex = heap.pop();
    // The heap holds only refine candidates, so this node IS childful and above
    // threshold — the only decision left is the budget. Cost of replacing this
    // node (an aggregate, recordCount 1) with its present children drawn as-is.
    const cbase = nodeIndex * 8;
    let childCost = 0;
    for (let k = 0; k < 8; k++) {
      const c = childIndex[cbase + k]!;
      if (c < 0) continue;
      childCost += recordCount[c]!;
    }
    const refineDelta = childCost - recordCount[nodeIndex]!;

    const shouldRefine =
      instanceCount < budget.typical && // refinement target not yet reached
      instanceCount + refineDelta <= budget.hardCap; // stays under the ceiling

    if (shouldRefine) {
      instanceCount += refineDelta;
      for (let k = 0; k < 8; k++) {
        const c = childIndex[cbase + k]!;
        if (c < 0) continue;
        pushOrCommit(c);
      }
    } else {
      // Budget-limited: draw the subtree's single aggregate instead of refining.
      commit(nodeIndex);
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
 * Refinement priority: a node's SQUARED on-screen-size proxy `edgePc² /
 * distanceToBox²`, larger = refine sooner. Reads the box geometry from the
 * load-time index's typed arrays; the distance to the axis-aligned box is 0 when
 * the camera is inside it. Squared so the heap order and the refine gate need no
 * `Math.sqrt` — `edge²/dist²` is monotonic in `edge/dist` for positive values,
 * so ordering and the `≥ threshold²` gate are exact.
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

  // Squared Euclidean distance in parsecs from the camera to the node's box
  // (0 inside). The box origin is `gridOrigin + gridCoords · edgePc`, baked at
  // load time.
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

// ── Output SoA scratch, reused across calls (see the header's non-reentrancy) ─
// Grow-only typed arrays the walk appends draws into; the returned snapshot is
// a view over `[0, cutCount)`. A fresh call resets `cutCount` and overwrites,
// so the previous snapshot is invalidated.
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
 * A binary max-heap of node indices keyed by a float priority. Best-first
 * refinement pops the largest-on-screen node next; a heap keeps that O(log n)
 * instead of an O(n) scan of the frontier each step. It holds only refine
 * candidates (commit-at-push keeps leaves and sub-pixel boxes out), so the pop
 * side does not carry the priority back out — the threshold was already decided
 * at push time.
 */
class MaxHeap {
  private readonly indices: number[] = [];
  private readonly priorities: number[] = [];

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
 * every frame — `reset()` keeps their capacity.
 */
const scratchHeap = new MaxHeap();
