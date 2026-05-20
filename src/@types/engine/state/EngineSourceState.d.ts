/**
 * EngineSourceState — loaded data + visibility selectors sub-bag of the
 * canonical `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `pickMask` — 32-bit per-source bitmask that the picker reads.  Flipped
 *                   IMMEDIATELY when the user toggles a survey off — a fading-
 *                   out layer must not be clickable even while it's still
 *                   visually present.
 *   - `drawMask` — 32-bit per-source bitmask that the renderer's per-frame
 *                   draw loop reads.  Flipped AFTER fade-out completes (kept
 *                   set during fade-out so the layer keeps drawing with
 *                   falling opacity) or AT the START of fade-in (so the
 *                   renderer begins drawing the layer even though opacity is
 *                   currently 0).  Updated by `setSourceVisible`.
 *   - `catalogs` — CPU-side mirror of every uploaded `GalaxyCatalog`, keyed by
 *                 `Source`.  Required for picking / hover (resolving a
 *                 GPU instance index back into GalaxyInfo) and for the
 *                 cross-catalog framing snapshot.
 *   - `famousMeta` / `famousXrefs` — optional sidecars that enrich the
 *                                     InfoCard text for the Famous catalog.
 *                                     Empty until the fetch resolves;
 *                                     consumers null-check before reading.
 *
 * ### Why a separate type
 *
 * The bag groups everything that answers "what's currently loaded and
 * visible?" — the same question many UI subsystems ask.  Keeping it
 * named lets future helpers accept just this slice (`(sources:
 * EngineSourceState) => ...`) rather than the whole engine state, which
 * is otherwise a recipe for callers reaching into unrelated bags.
 */

import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { Tier } from '../../data/Tier';
import type { Source } from '../../../data/sources';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../loading/FamousXrefMap';

export type EngineSourceState = {
  /**
   * pickMask — clicked layer is non-clickable IMMEDIATELY on toggle off.
   * The picker reads this mask; a fading-out layer is excluded from
   * the pick output even while it's still visually fading. Flipped
   * synchronously in setSourceVisible.
   */
  pickMask: number;
  /**
   * drawMask — read by the renderer's per-source draw loop. Flipped
   * AFTER the fade-out smoothstep completes (or AT the start of
   * fade-in). A layer with its drawMask bit clear is skipped from
   * the draw entirely — saves a writeBuffer + draw call.
   */
  drawMask: number;
  catalogs: Map<Source, GalaxyCatalog>;
  famousMeta: FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  /**
   * Currently-loaded data tier — drives subsequent `setTier` diffing.
   * Seeded at engine init from `opts.initialTier` (defaulting to 'medium')
   * and re-assigned synchronously from inside `setTier` before the per-source
   * reloads dispatch, so the next `setTier` call sees the freshly-active tier
   * as its `prev`.
   */
  tier: Tier;
};
