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
 * ── The covering-partition invariant (load-bearing) ────────────────────────
 *
 * The returned draws are a *covering partition* of the catalog's leaf stars:
 * every leaf star is represented exactly once — either by its own refined leaf
 * draw, or by exactly one ancestor aggregate that stands in for its whole
 * subtree — never by both, never by neither. This falls out of the walk being
 * a frontier (antichain) of the octree that covers the root: descent replaces a
 * node by the complete set of its present children (`childMask` names every
 * populated octant), and each descent path terminates either at a leaf or at an
 * aggregate we commit. Double-drawing a star (an ancestor *and* its descendant
 * both drawn) or dropping one (a subtree neither refined nor aggregated) is the
 * bug class the tests guard against.
 *
 * ── Layout invariants this walk relies on ──────────────────────────────────
 *
 * From `buildStarOctree`'s "On-disk layout invariants": `catalog.nodes` holds
 * all leaves first in ascending Morton order, then the aggregate pyramid by
 * ascending `(level, mortonIndex)`, so the *final* node is the single root the
 * descent starts from. A parent's Morton code is `child >> 3` and a child's
 * octant is `child & 7`; inverting that, a level-`L` node with Morton `M` has
 * its present children at level `L-1` with Morton `(M << 3) | k` for each bit
 * `k` set in `childMask`. A `(level, morton) → nodeIndex` map built once from
 * the node table resolves those children. Each node already names its own
 * record slice (`firstRecord`, `recordCount`), so a draw is just that slice.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import { mortonDecode3 } from '../../../../utils/math/mortonDecode3';

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
  const { nodes } = catalog;
  if (nodes.length === 0) return [];

  // ── Children lookup: (level, morton) → nodeIndex, built once ──────────────
  // A node's present children are level-1 nodes at Morton (M << 3) | k for each
  // octant k set in childMask; this map resolves those (level, morton) keys to
  // their node index without scanning the table per descent step.
  const nodeByKey = new Map<number, number>();
  for (let i = 0; i < nodes.length; i++) {
    nodeByKey.set(nodeKey(nodes[i]!.level, nodes[i]!.mortonIndex), i);
  }

  // ── Best-first frontier: a max-heap keyed by on-screen size ───────────────
  // Refinement always advances the largest-on-screen node, so budget is spent
  // nearest-first. `instanceCount` tracks Σ recordCount over the current draw
  // set (frontier nodes + committed nodes drawn as-is); refining a node swaps
  // its own cost for its children's, keeping the count exact so the final total
  // is known before the walk ends.
  const heap = new MaxHeap();
  const committed: StarNodeDraw[] = [];

  const rootIndex = nodes.length - 1; // layout invariant: root is the last node
  let instanceCount = nodes[rootIndex]!.recordCount;
  heap.push(rootIndex, nodePriority(catalog, rootIndex, camPosPc));

  while (heap.size > 0) {
    const nodeIndex = heap.pop();
    const node = nodes[nodeIndex]!;

    // Leaves cannot be refined — they are the real stars; always draw as-is.
    // Their recordCount is already folded into instanceCount (added either as
    // the root's own cost or via a parent's childCost when it was refined).
    if (node.level === 0) {
      committed.push({
        nodeIndex,
        firstRecord: node.firstRecord,
        recordCount: node.recordCount,
      });
      continue;
    }

    const edgePc = catalog.cellEdgePc * 2 ** node.level;
    const distPc = distanceToBox(catalog, node.mortonIndex, node.level, camPosPc);
    const angularSize = edgePc / Math.max(distPc, MIN_DISTANCE_PC);

    // Cost of replacing this aggregate (recordCount 1) with its present
    // children drawn as-is (leaf children add their full star count).
    const childIndices = presentChildren(nodeByKey, node);
    let childCost = 0;
    for (const c of childIndices) childCost += nodes[c]!.recordCount;
    const refineDelta = childCost - node.recordCount;

    const shouldRefine =
      childIndices.length > 0 &&
      angularSize >= refineThreshold && // near/large enough to resolve
      instanceCount < budget.typical && // refinement target not yet reached
      instanceCount + refineDelta <= budget.hardCap; // stays under the ceiling

    if (shouldRefine) {
      instanceCount += refineDelta;
      for (const c of childIndices) heap.push(c, nodePriority(catalog, c, camPosPc));
    } else {
      // Far, sub-pixel, or budget-limited: draw the subtree's single aggregate.
      committed.push({
        nodeIndex,
        firstRecord: node.firstRecord,
        recordCount: node.recordCount,
      });
    }
  }

  return committed;
}

/** Pack (level, morton) into one integer key for the children lookup map. */
function nodeKey(level: number, morton: number): number {
  // level is a single on-disk byte (0..255); shift morton clear of it.
  return level * 0x100000000 + morton;
}

/** The present child node indices of an aggregate, via the (level, morton) map. */
function presentChildren(
  nodeByKey: Map<number, number>,
  node: { level: number; mortonIndex: number; childMask: number },
): number[] {
  const children: number[] = [];
  const childLevel = node.level - 1;
  const baseMorton = node.mortonIndex << 3;
  for (let k = 0; k < 8; k++) {
    if ((node.childMask & (1 << k)) === 0) continue;
    const idx = nodeByKey.get(nodeKey(childLevel, baseMorton | k));
    if (idx !== undefined) children.push(idx);
  }
  return children;
}

/** Refinement priority: a node's on-screen size proxy, larger = refine sooner. */
function nodePriority(catalog: StarCatalog, nodeIndex: number, camPosPc: Vec3): number {
  const node = catalog.nodes[nodeIndex]!;
  const edgePc = catalog.cellEdgePc * 2 ** node.level;
  const distPc = distanceToBox(catalog, node.mortonIndex, node.level, camPosPc);
  return edgePc / Math.max(distPc, MIN_DISTANCE_PC);
}

/**
 * Euclidean distance in parsecs from the camera to a node's axis-aligned box
 * (0 when the camera is inside). The box origin is `gridOrigin + gridCoords ·
 * edgePc`, where `gridCoords = mortonDecode3(morton)` and the box spans
 * `2^level` leaf cells per axis — the same reconstruction `buildStarOctree`
 * and `starNodeOriginRelCamMpc` use. `camPosPc` is in the same heliocentric
 * parsec frame `gridOrigin` lives in.
 */
function distanceToBox(catalog: StarCatalog, morton: number, level: number, camPosPc: Vec3): number {
  const edgePc = catalog.cellEdgePc * 2 ** level;
  const [gx, gy, gz] = catalog.gridOrigin;
  const [cx, cy, cz] = mortonDecode3(morton);
  const originPc: Vec3 = [gx + cx * edgePc, gy + cy * edgePc, gz + cz * edgePc];

  let sq = 0;
  for (let axis = 0; axis < 3; axis++) {
    const lo = originPc[axis]!;
    const hi = lo + edgePc;
    const c = camPosPc[axis]!;
    const d = c < lo ? lo - c : c > hi ? c - hi : 0;
    sq += d * d;
  }
  return Math.sqrt(sq);
}

/**
 * A binary max-heap of node indices keyed by a float priority. Best-first
 * refinement pops the largest-on-screen node next; a heap keeps that O(log n)
 * instead of an O(n) scan of the frontier each step.
 */
class MaxHeap {
  private readonly indices: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.indices.length;
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
