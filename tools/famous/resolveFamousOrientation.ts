/**
 * resolveFamousOrientation — pick each famous galaxy's render orientation,
 * field by field, preferring real measurements over the deterministic hash.
 *
 * The famous seed frequently carries a real `axisRatio` (HyperLEDA logR25)
 * but no `positionAngleDeg`: PA is genuinely unmeasured for face-on disks,
 * which is most of the famous showpieces (M101, M74, M83, …).  An earlier
 * rule baked real orientation only when BOTH fields were present and otherwise
 * fabricated BOTH from `fallbackOrientation()` — so a correct axis ratio (e.g.
 * M101's 0.96, a near-face-on disk) was discarded and replaced with a random
 * ~0.53 / 58° tilt that made the galaxy render badly inclined.
 *
 * This resolves the two fields independently: keep whatever is real, fall back
 * only what is missing.  That is safe for the renderer's "is this a fallback
 * row?" detector (`buildPointInterleavedBuffer` / `galaxyInfoBuilder`), which
 * flags a row only when BOTH axisRatio AND positionAngleDeg equal the hash —
 * so a real-axisRatio + fallback-PA row is correctly treated as real, and the
 * arbitrary PA on a near-circular disk is visually irrelevant.
 *
 * We always compute the fallback (cheap) so a missing field has a deterministic
 * value rather than NaN — NaN would slip past the equality detector AND
 * propagate into the vertex attributes, collapsing the orientation disk.
 */

import { fallbackOrientation } from '../../src/utils/random/fallbackOrientation';

export type ResolveFamousOrientationInput = {
  /** Real axis ratio b/a, or undefined when the seed has no measurement. */
  axisRatio: number | undefined;
  /** Real position angle (deg), or undefined when genuinely unmeasured. */
  positionAngleDeg: number | undefined;
  /** Row identity + sky position — the deterministic fallback's only inputs. */
  objID: bigint;
  ra: number;
  dec: number;
};

export function resolveFamousOrientation(input: ResolveFamousOrientationInput): {
  axisRatio: number;
  positionAngleDeg: number;
} {
  const fb = fallbackOrientation(input.objID, input.ra, input.dec);
  return {
    axisRatio: input.axisRatio ?? fb.axisRatio,
    positionAngleDeg: input.positionAngleDeg ?? fb.positionAngleDeg,
  };
}
