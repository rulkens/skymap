/**
 * poiFocusDistance — per-category framing-distance helper for POI
 * focus camera tweens.  Companion to `galaxyFocusDistance.ts`.
 *
 * ### Why a separate helper from galaxyFocusDistance.ts
 *
 * The galaxy `galaxyFocusDistance(diameterKpc)` uses a flat 8× multiplier
 * on the galaxy diameter — appropriate for objects whose physical size
 * is measured in kpc.  Applying the same 8× to a supercluster with a
 * 50 Mpc radius (100 Mpc diameter) would frame the camera 800 Mpc out
 * — past the edge of the visible volume, and a useless final position
 * because the structure would project to a few pixels.
 *
 * Per-category multipliers reflect that the user wants different
 * framings:
 *   - A cluster (~Mpc radius) at 8× shows the whole halo with comfort
 *     margin and a generous slice of the surrounding member field.
 *   - A supercluster (~10s of Mpc radius) at 2.5× fills the screen
 *     with the structure itself — the user is already at galaxy-cluster
 *     scale; pushing further out hands the screen back to anonymous
 *     background.
 *   - A void at 2.5× matches the supercluster framing — voids and
 *     superclusters are roughly the same scale, and the goal is the
 *     same: the structure fills the screen.
 *   - A group at 8× mirrors the cluster framing — groups are halo
 *     structures at sub-Mpc to few-Mpc scale; the 1 Mpc min-clamp
 *     keeps the Local Group (R0 ≈ 1 Mpc) sane.
 *
 * Famous galaxies are NOT a category here.  They route through the
 * galaxy `focusOn` / `selectFamous` chain, which uses
 * `galaxyFocusDistance(diameterKpc)` directly — see `selectFamous` in
 * engine.ts.
 *
 * ### Why we didn't extend `galaxyFocusDistance` with an optional multiplier
 *
 * Considered briefly (spec §5.3 Option A): widen the galaxy helper to
 * accept a multiplier override.  Rejected because it would give a
 * single-purpose function a second responsibility (POI category
 * dispatch) that belongs to a different domain.  A dedicated helper
 * keeps both call surfaces narrow + audited — and makes the per-
 * category constants discoverable in one file.
 *
 * ### Clamp rationale
 *
 * - **Minimum 1 Mpc**: avoids burying the camera inside an unusually
 *   small POI.  The visible volume's near plane is ~0.01 Mpc, so 1
 *   Mpc still gives the user plenty of foreground context.
 * - **Maximum 800 Mpc**: the visible volume comfortably extends past
 *   1 Gpc, but framing further than 800 Mpc out makes most structures
 *   project to tens of pixels — the user reads it as "I didn't move"
 *   rather than "I'm framing this thing".  Clamps the framing of a
 *   freakishly-large structure to something visually useful.
 */

import type { PoiCategory } from '../../../@types/engine/data/PoiCategory';

// Per-category framing multipliers.  See module header for rationale.
// Famous galaxies are not in this table — they take the galaxy path
// via galaxyFocusDistance(diameterKpc).
const CATEGORY_MULTIPLIER: Readonly<Record<Exclude<PoiCategory, 'famousGalaxy'>, number>> = {
  cluster: 8,
  supercluster: 2.5,
  void: 2.5,
  // Groups are halo structures like clusters; 8× frames the halo + neighbourhood.
  // The 1 Mpc min-clamp keeps the tiny Local Group sane.
  group: 8,
};

const MIN_FRAMING_DISTANCE_MPC = 1;
const MAX_FRAMING_DISTANCE_MPC = 800;

/**
 * Compute the camera-target distance (Mpc) for a tween toward a POI of
 * the given category + physical radius.  Clamped to
 * [MIN_FRAMING_DISTANCE_MPC, MAX_FRAMING_DISTANCE_MPC].
 *
 * Non-finite or non-positive `physicalRadiusMpc` is treated as zero (so
 * the result clamps to the minimum) for `cluster` / `supercluster` /
 * `void`.  Positive infinity clamps to the maximum.
 *
 * Throws `TypeError` for `'famousGalaxy'` — that category routes
 * through the galaxy `galaxyFocusDistance` path, not this helper.  Throwing
 * (rather than silently returning a fallback) makes a wrong-path call
 * surface immediately instead of producing a confusing framing.
 */
export function poiFocusDistance(category: PoiCategory, physicalRadiusMpc: number): number {
  if (category === 'famousGalaxy') {
    throw new TypeError('poiFocusDistance: famousGalaxy POIs use the galaxyFocusDistance path');
  }
  const multiplier = CATEGORY_MULTIPLIER[category];
  // Treat NaN / negative as 0 so the clamp does the right thing.
  // Positive infinity passes through and hits the upper clamp.
  const safeRadius =
    Number.isFinite(physicalRadiusMpc) && physicalRadiusMpc > 0
      ? physicalRadiusMpc
      : physicalRadiusMpc === Number.POSITIVE_INFINITY
        ? physicalRadiusMpc
        : 0;
  const raw = multiplier * safeRadius;
  return Math.min(Math.max(raw, MIN_FRAMING_DISTANCE_MPC), MAX_FRAMING_DISTANCE_MPC);
}
