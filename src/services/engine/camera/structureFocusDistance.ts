/**
 * structureFocusDistance — framing-distance helper for structure focus camera
 * tweens. Companion to `galaxyFocusDistance.ts`.
 *
 * ### Framing intent: frame so the ring has *just* faded out
 *
 * Focusing a structure is an invitation to inspect what's inside it — the
 * member galaxies, the local field. The ring + label are navigational chrome;
 * once you've arrived they're in the way. So we frame the structure large
 * enough that its marker has *just* crossed the close-approach fade-out
 * (`structureMarkerStyles`' `markerMaxApparentRadiusPx`), leaving the interior
 * unobscured. The same fade governs the label, so label and ring disappear
 * together and the view is clean.
 *
 * ### Why a screen-fill factor, FOV-independent
 *
 * The close-approach fade is keyed to the *apparent* radius in pixels. Framing
 * that same `apparentRadiusMpc` to a fixed fraction of the screen makes the
 * on-screen ring radius work out to `FOCUS_FILL × (viewportHeight / 2)`,
 * independent of the field of view:
 *
 *   apparentRadiusPx = (R / distance) · pxPerRad
 *   pxPerRad         = (viewportHeight / 2) / tan(fovY / 2)
 *   distance         = R / (FOCUS_FILL · tan(fovY / 2))
 *   ⇒ apparentRadiusPx = FOCUS_FILL · (viewportHeight / 2)
 *
 * One fill factor frames every structure to the same on-screen size. The fade
 * threshold is identical for all four structure categories, so a single factor
 * covers cluster / supercluster / void / group — no per-category multiplier,
 * hence no category parameter.
 *
 * ### Why not tie the distance exactly to the pixel threshold
 *
 * An exact tie would need the live viewport height. These framing helpers are
 * deliberately viewport-agnostic (`galaxyFocusDistance` is a flat multiplier;
 * nothing here reads canvas pixels), and the tween path has no viewport handle.
 * `FOCUS_FILL` keeps the framing in that angular, pixel-free world — slightly
 * conservative on short viewports, the safe direction (a touch more faded,
 * never less). Below ~1000px tall the ring re-enters the fade band; that floor
 * is the trade for backing off enough that the interior isn't cramped.
 *
 * ### Clamp rationale
 *
 * - **No minimum for real radii**: the distance follows the radius alone, so a
 *   parsec-scale structure frames within tens of parsecs. A non-finite or
 *   non-positive radius has nothing to frame and falls back to a fixed
 *   `DEGENERATE_RADIUS_DISTANCE_MPC`, so a bad record never yields a NaN or a
 *   camera sitting on the target.
 * - **Maximum 800 Mpc**: framing a freakishly-large structure further out
 *   projects it to a few pixels — the user reads it as "I didn't move".
 */

/**
 * Apparent ring radius at focus, as a multiple of the half-viewport-height.
 * 2.2 overflows the viewport ~2.2:1, landing the marker past the close-approach
 * fade-out (full-clear ~1100px) on standard viewports. See module header.
 */
const FOCUS_FILL = 2.2;

const DEGENERATE_RADIUS_DISTANCE_MPC = 0.1;
const MAX_FRAMING_DISTANCE_MPC = 800;

/**
 * Camera-target distance (Mpc) for a tween toward a structure, framing its
 * `apparentRadiusMpc` so the ring + label have just faded out. Capped at
 * MAX_FRAMING_DISTANCE_MPC.
 *
 * `apparentRadiusMpc` is the WIDER extent the close-approach fade reads
 * (`apparentRadiusMpc ?? physicalRadiusMpc` at the call site). Non-finite or
 * non-positive values return DEGENERATE_RADIUS_DISTANCE_MPC; positive infinity
 * clamps to the maximum.
 */
export function structureFocusDistance(apparentRadiusMpc: number, fovYRad: number): number {
  if (apparentRadiusMpc === Number.POSITIVE_INFINITY) return MAX_FRAMING_DISTANCE_MPC;
  if (!Number.isFinite(apparentRadiusMpc) || apparentRadiusMpc <= 0) {
    return DEGENERATE_RADIUS_DISTANCE_MPC;
  }
  return Math.min(
    apparentRadiusMpc / (FOCUS_FILL * Math.tan(fovYRad / 2)),
    MAX_FRAMING_DISTANCE_MPC,
  );
}
