/**
 * poiFocusDistance — framing-distance helper for POI focus camera tweens.
 * Companion to `galaxyFocusDistance.ts`.
 *
 * ### Framing intent: frame so the ring has *just* faded out
 *
 * Focusing a structure is an invitation to inspect what's inside it — the
 * member galaxies, the local field. The ring + label are navigational chrome;
 * once you've arrived they're in the way. So we frame the structure large
 * enough that its marker has *just* crossed the close-approach fade-out
 * (`structurePoiStyles`' `markerMaxApparentRadiusPx`), leaving the interior
 * unobscured. The same fade governs the label, so label and ring disappear
 * together and the view is clean.
 *
 * ### Why a screen-fill factor instead of per-category Mpc multipliers
 *
 * The close-approach fade is keyed to the *apparent* radius in pixels. If we
 * frame the same apparent radius the fade reads — `apparentRadiusMpc` — to a
 * fixed fraction of the screen, the resulting on-screen ring radius works out
 * to exactly `FOCUS_FILL × (viewportHeight / 2)`, *independent of the field of
 * view*:
 *
 *   apparentRadiusPx = (R / distance) · pxPerRad
 *   pxPerRad         = (viewportHeight / 2) / tan(fovY / 2)
 *   distance         = R / (FOCUS_FILL · tan(fovY / 2))
 *   ⇒ apparentRadiusPx = FOCUS_FILL · (viewportHeight / 2)
 *
 * So one fill factor frames every structure to the same on-screen size. With
 * `FOCUS_FILL = 2.5` the ring overflows the viewport ~2.5:1 — past the fade's
 * full-clear point (`markerMaxApparentRadiusPx + markerMaxApparentFadeBandPx`
 * = 1100px) on any viewport taller than ~900px. The close-approach fade
 * threshold is the SAME for all four structure categories, so a single factor
 * covers cluster / supercluster / void / group — the per-category framing
 * multipliers this helper used to carry are no longer needed.
 *
 * ### Why not tie the distance exactly to the pixel threshold
 *
 * An exact tie would set `apparentRadiusPx = markerMaxApparentRadiusPx`, which
 * needs the live viewport height in the framing math. The camera-framing
 * helpers are deliberately viewport-agnostic (`galaxyFocusDistance` is a flat
 * multiplier; nothing here reads canvas pixels), and the tween path has no
 * viewport handle. `FOCUS_FILL` keeps the framing in that angular, pixel-free
 * world — slightly conservative on very short viewports, which is the safe
 * direction (a touch more faded, never less).
 *
 * Famous galaxies are NOT a category here. They route through the galaxy
 * `focusOn` / `selectFamous` chain, which uses `galaxyFocusDistance`.
 *
 * ### Clamp rationale
 *
 * - **Minimum 0.1 Mpc**: low enough to let a sub-Mpc group frame close enough
 *   for its ring to clear the fade (the whole point), while staying 10× the
 *   ~0.01 Mpc near plane so the target never clips. Only bites for degenerate
 *   sub-0.1 Mpc apparent radii that no real structure has.
 * - **Maximum 800 Mpc**: the visible volume extends past 1 Gpc, but framing a
 *   freakishly-large structure further than 800 Mpc out projects it to a few
 *   pixels — the user reads it as "I didn't move". Clamps to something useful.
 */

import type { PoiCategory } from '../../../@types/engine/data/PoiCategory';

/**
 * Apparent ring radius at focus, as a multiple of the half-viewport-height.
 * 2.5 overflows the viewport ~2.5:1, landing the marker past the close-approach
 * fade-out (full-clear ~1100px) on standard viewports. See module header.
 */
const FOCUS_FILL = 2.5;

const MIN_FRAMING_DISTANCE_MPC = 0.1;
const MAX_FRAMING_DISTANCE_MPC = 800;

/**
 * Compute the camera-target distance (Mpc) for a tween toward a structure POI,
 * framing its `apparentRadiusMpc` so the ring + label have just faded out.
 * Clamped to [MIN_FRAMING_DISTANCE_MPC, MAX_FRAMING_DISTANCE_MPC].
 *
 * `apparentRadiusMpc` is the WIDER extent the close-approach fade reads
 * (`apparentRadiusMpc ?? physicalRadiusMpc` at the call site). Non-finite or
 * non-positive values are treated as zero, so the result clamps to the
 * minimum; positive infinity clamps to the maximum.
 *
 * Throws `TypeError` for `'famousGalaxy'` — that category routes through the
 * `galaxyFocusDistance` path, not this helper. Throwing (rather than silently
 * returning a fallback) surfaces a wrong-path call immediately.
 */
export function poiFocusDistance(
  category: PoiCategory,
  apparentRadiusMpc: number,
  fovYRad: number,
): number {
  if (category === 'famousGalaxy') {
    throw new TypeError('poiFocusDistance: famousGalaxy POIs use the galaxyFocusDistance path');
  }
  // Treat NaN / negative as 0 so the clamp does the right thing; positive
  // infinity passes through to the upper clamp.
  const safeRadius =
    Number.isFinite(apparentRadiusMpc) && apparentRadiusMpc > 0
      ? apparentRadiusMpc
      : apparentRadiusMpc === Number.POSITIVE_INFINITY
        ? apparentRadiusMpc
        : 0;
  const raw = safeRadius / (FOCUS_FILL * Math.tan(fovYRad / 2));
  return Math.min(Math.max(raw, MIN_FRAMING_DISTANCE_MPC), MAX_FRAMING_DISTANCE_MPC);
}
