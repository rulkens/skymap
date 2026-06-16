/**
 * EngineSourceState — loaded data + visibility selectors sub-bag of the
 * canonical `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `tier` — the currently-loaded data tier marker, the input to subsequent
 *                   `setTier` diffing.  The draw/pick bitmasks are NOT held
 *                   here: they're a pure projection of settings + live fade
 *                   opacity, derived on read (per-frame in `runFrame`, fresh at
 *                   click time), never a cached field.
 *
 * ### Why a separate type
 *
 * The bag groups everything that answers "what's currently loaded and
 * visible?" — the same question many UI subsystems ask.  Keeping it
 * named lets future helpers accept just this slice (`(sources:
 * EngineSourceState) => ...`) rather than the whole engine state, which
 * is otherwise a recipe for callers reaching into unrelated bags.
 */

import type { Tier } from '../../data/Tier';

export type EngineSourceState = {
  /**
   * Currently-loaded data tier — drives subsequent `setTier` diffing.
   * Seeded at engine init from `opts.initialTier` (defaulting to 'medium')
   * and re-assigned synchronously from inside `setTier` before the per-source
   * reloads dispatch, so the next `setTier` call sees the freshly-active tier
   * as its `prev`.
   */
  tier: Tier;
};
