import type { StarCatalog } from '../../../../../@types/data/starCatalog/StarCatalog';
import type { StarFadeState } from '../../../../../@types/rendering/StarFadeState';

/**
 * A catalog's per-node LOD-fade state, persisted across frames. The best-first
 * cut (`walkStarOctreeCut`) is view-dependent — rotating the camera or crossing
 * a split/merge threshold changes which nodes are in the cut — so every
 * membership change would be a hard one-frame pop without this. Each frame:
 * nodes newly in the cut enter at opacity 0 heading to 1; nodes that left the
 * cut stay in the draw list heading to 0, and are dropped once they reach 0.
 *
 * ── Flat typed arrays + frame stamps, not a `Map<number, NodeFade>` ─────────
 *
 * At star-field zoom the cut is ~46k nodes EVERY frame. The old shape kept a
 * `Map<nodeIndex, { opacity, seen }>`, so each frame paid: a hash lookup +
 * `.set` of a fresh `{opacity,seen}` heap object per NEWCOMER, and a full
 * `for..of` iteration over the whole Map (its entries are scattered heap objects,
 * cache-miss-bound) to advance + prune. Replacing it with arrays indexed BY the
 * node index turns every access into a contiguous typed-array read — no hashing,
 * no per-entry heap object, no Map iteration order. The arrays are sized to
 * `catalog.nodes.length` and allocated ONCE per catalog (≈7.5 MB on the large
 * tier — load-time scale, not per-frame), so steady-state frames allocate zero.
 *
 * ── The two-stamp scheme (replaces Map membership) ─────────────────────────
 *
 * The Map answered two membership questions implicitly (is a node in the cut?
 * still fading and worth advancing?). Two monotonic per-node frame stamps answer
 * them without a set:
 *   - `inCutFrame[idx] === frame` ⇒ this node is in THIS frame's walk cut
 *     (target 1); otherwise it is leaving (target 0). Set in pass 1.
 *   - `activeFrame[idx] === frame` ⇒ this node was processed onto THIS frame's
 *     active list (still ≥ 0 opacity, drawn in some stream). Used both to detect
 *     a NEWCOMER (`activeFrame[idx] !== frame - 1` — it was not active last frame,
 *     so seed its opacity at 0) and, via `activeList`, to walk the *previous*
 *     frame's active set without scanning all N nodes.
 * `frame` is the catalog's own monotonic counter, `++`ed at the top of each
 * advance, so it starts at 1 and stamp 0 (the Uint32Array zero-fill) is never a
 * live stamp — a fresh catalog's zero-filled stamps can never false-match.
 *
 * `activeList` / `prevActiveList` are a DOUBLE BUFFER: each frame reads the
 * previous frame's active indices out of `prevActiveList` (to advance the nodes
 * that left the cut toward 0) while rebuilding this frame's set into `activeList`,
 * then swaps the two references. Rebuilding in place while reading would corrupt
 * the read, and scanning all N nodes to find the fading ones would defeat the
 * point — the active set is the cut plus a bounded tail of leaving nodes, far
 * smaller than N. The active list can never exceed N (each node appears once), so
 * it is sized to N and never grows.
 *
 * Keyed by the CATALOG object, not the source code, for two free properties:
 *   1. Test + tier-swap isolation — a replaced catalog (tier change) is a new
 *      object, so it starts with fresh fade state and the old arrays are GC'd via
 *      the WeakMap; a stale node index can never index into the wrong catalog.
 *   2. It is still per-SOURCE in practice — the renderer holds exactly one
 *      catalog per source (`loadedCatalogs` yields one each), so per-catalog IS
 *      per-source, with none of the manual invalidation source-keying needs.
 *
 * `clockMs` is the catalog's own last-drawn frame time, so `dt` is derived
 * without a shared module clock (every catalog is drawn on the same frame, so a
 * per-catalog clock yields the identical dt a global one would). `null` on the
 * first frame a catalog is seen, which snaps every node straight to its target
 * (dt = Infinity ⇒ step = 1): the star bubble's first paint is its steady state,
 * and only later membership CHANGES animate — the same first-frame rule
 * `foregroundLabelsPass` uses.
 */
const fadeStateByCatalog = new WeakMap<StarCatalog, StarFadeState>();

export function fadeStateFor(catalog: StarCatalog): StarFadeState {
  let state = fadeStateByCatalog.get(catalog);
  if (state === undefined) {
    const n = catalog.nodes.length;
    // The active list can never exceed N (each node is appended at most once per
    // frame), so N is a hard upper bound and the buffers never grow. `max(1, n)`
    // keeps a degenerate empty catalog from allocating a zero-length buffer.
    const cap = Math.max(1, n);
    state = {
      opacity: new Float32Array(n),
      inCutFrame: new Uint32Array(n),
      activeFrame: new Uint32Array(n),
      activeList: new Int32Array(cap),
      prevActiveList: new Int32Array(cap),
      prevActiveCount: 0,
      clockMs: null,
      frame: 0,
    };
    fadeStateByCatalog.set(catalog, state);
  }
  return state;
}
