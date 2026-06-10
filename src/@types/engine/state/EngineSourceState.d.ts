/**
 * EngineSourceState — loaded data + visibility selectors sub-bag of the
 * canonical `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `pickMask` / `drawMask` — 32-bit per-source bitmasks read by the picker
 *                   and the renderer's per-frame draw loop.  Both are DERIVED
 *                   OUTPUTS: `deriveSourceMasks` recomputes them every frame
 *                   (and synchronously inside `setSourceVisible` on a toggle)
 *                   from each survey's `settings.surveys.items[id].enabled`
 *                   flag + that survey's live fade opacity.  No setter writes
 *                   them directly — the settings record is the single source
 *                   of truth, and these masks are a compiled projection of it.
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
   * pickMask — derived output, packed from `enabled` alone (= intent). The
   * picker reads this mask; a survey toggled off is non-clickable the
   * instant it's toggled, even while still visibly fading. Recomputed by
   * `deriveSourceMasks`, never assigned by a setter.
   */
  pickMask: number;
  /**
   * drawMask — derived output, packed from `enabled || opacity > 0`. The
   * renderer's per-source draw loop reads it; a just-hidden survey keeps
   * its draw bit through the fade-out tail (so it ramps down smoothly) and
   * loses it only once opacity resolves to 0. Recomputed by
   * `deriveSourceMasks`, never assigned by a setter.
   */
  drawMask: number;
  /**
   * Currently-loaded data tier — drives subsequent `setTier` diffing.
   * Seeded at engine init from `opts.initialTier` (defaulting to 'medium')
   * and re-assigned synchronously from inside `setTier` before the per-source
   * reloads dispatch, so the next `setTier` call sees the freshly-active tier
   * as its `prev`.
   */
  tier: Tier;
};
