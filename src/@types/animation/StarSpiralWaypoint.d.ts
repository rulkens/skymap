/**
 * StarSpiralWaypoint — one stop on the baked "star spiral" camera path: a real
 * star the clip flies to, expressed as a bare heliocentric world-space anchor.
 *
 * The spiral is authored offline. `tools/animation/buildStarSpiral.ts` lays an
 * ideal outward spiral over the Gaia catalogue, snaps the brightest real star in
 * each corridor onto it, and emits the ordered result as
 * `starSpiralWaypoints.generated.ts`. A waypoint is therefore already resolved —
 * unlike `PathWaypoint`, it never carries a catalog `id` to look up at play time,
 * because the offline build already did the lookup and froze the position. The
 * runtime clip consumes these in order and needs nothing more than where to point
 * the camera; framing distance and approach angles are the clip's own concern,
 * derived from the leg geometry rather than stored per waypoint.
 *
 * ── Units: heliocentric Mpc, not the catalogue's parsecs ───────────────────
 *
 * `at` is in Megaparsecs, the scene's canonical world unit (see `scaleUnits.ts`),
 * so a waypoint drops straight into the camera path with no per-consumer
 * conversion. The build reconstructs star positions in parsecs (the star
 * catalogue's native frame) and converts once, at the emit boundary — the same
 * discipline `raDecDistToCartesian` callers follow — so this shape stays in the
 * frame every other clip anchor already speaks.
 *
 * ── Why the optional identity fields ───────────────────────────────────────
 *
 * When a snapped star coincides with a curated famous star, the build stamps its
 * seed `famousId` (e.g. 'sirius') and human `name` so the clip can surface a
 * caption without re-deriving the match. Most waypoints are anonymous Gaia stars
 * with neither field; the identity is present only where the offline match
 * succeeded, so both are optional rather than a nullable pair.
 */

import type { Vec3 } from '../math/Vec3';

export type StarSpiralWaypoint = {
  /** Heliocentric world position in Mpc — the camera's target for this leg. */
  readonly at: Vec3;
  /** Curated famous-star seed id when the snapped star is one; absent otherwise. */
  readonly famousId?: string;
  /** The famous star's common name, paired with `famousId`. */
  readonly name?: string;
};
