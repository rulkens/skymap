import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import type { StarFadeState } from '../../@types/StarFadeState';

/**
 * Runs long by design: sole owner of the per-node LOD-fade scheme every
 * other file only points back to.
 *
 * One catalog's persistent per-node LOD-fade state, dissolving the
 * view-dependent cut's membership pop: a node enters the cut at opacity 0
 * heading to 1, and stays in the draw list heading to 0 (dropped at 0) after
 * it leaves. LINEAR, not eased — luminance is linear in opacity, so a
 * complementary split/merge fade conserves total flux exactly
 * (`parentFlux·(1−t) + childrenFlux·t = F`); eased would momentarily
 * mis-count. Flat typed arrays indexed by node, not a `Map`, for the same
 * GC-churn reason `StarNodeStream` states in full.
 *
 * Two monotonic per-node frame stamps replace a Map's membership test:
 * `inCutFrame[idx] === frame` ⇒ in this frame's cut (target 1);
 * `activeFrame[idx] === frame` ⇒ on this frame's active (drawn) list, and
 * `!== frame - 1` is the NEWCOMER test that seeds opacity 0. `frame` is
 * `++`ed once per advance, so stamp 0 (zero-fill) never false-matches.
 *
 * `activeList` / `prevActiveList` are a DOUBLE BUFFER: each frame reads
 * `prevActiveList` (nodes leaving, heading to 0) while rebuilding
 * `activeList`, then swaps the two — rebuilding in place while reading would
 * corrupt the read.
 *
 * Keyed by the CATALOG object — a tier swap hands a fresh one. `clockMs ===
 * null` snaps a catalog's first frame straight to target (dt = Infinity ⇒
 * step = 1).
 */
const fadeStateByCatalog = new WeakMap<StarCatalog, StarFadeState>();

export function fadeStateFor(catalog: StarCatalog): StarFadeState {
  let state = fadeStateByCatalog.get(catalog);
  if (state === undefined) {
    const n = catalog.nodes.length;
    // Never exceeds N (each node appended at most once per frame); `max(1, n)`
    // avoids a zero-length buffer for a degenerate empty catalog.
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
