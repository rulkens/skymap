/**
 * Field of view (arcmin) for a galaxy thumbnail, scaled to the galaxy's
 * apparent angular size.
 *
 * A fixed FOV (the old hardcoded 2 arcmin) crops a nearby giant like M31 to
 * its core and shrinks a distant galaxy to a speck.  Sizing the cutout to the
 * galaxy's own angular extent makes every thumbnail frame the galaxy roughly
 * the same way.
 *
 * Small-angle: θ_rad = D / d, with D the physical diameter and d the distance.
 * In kpc / Mpc, θ_arcmin = (diameterKpc / distanceMpc) × 206265 / 1000 / 60
 *                        = (diameterKpc / distanceMpc) × 3.4377.
 *
 * We then add a margin so the galaxy doesn't touch the frame edge, and clamp:
 * a floor so tiny/uncertain sizes don't zoom into noise, and a ceiling so a
 * local-group giant doesn't request an absurd field.  When the inputs are
 * missing or non-finite we return the historical 2-arcmin default.
 */
const ARCMIN_PER_KPC_AT_MPC = 3.4377;
const MARGIN = 1.6;
const MIN_ARCMIN = 1;
const MAX_ARCMIN = 200;
const DEFAULT_ARCMIN = 2;

export function galaxyThumbnailFovArcmin(diameterKpc: number, distanceMpc: number): number {
  if (!(diameterKpc > 0) || !(distanceMpc > 0)) return DEFAULT_ARCMIN;
  const theta = (diameterKpc / distanceMpc) * ARCMIN_PER_KPC_AT_MPC;
  return Math.max(MIN_ARCMIN, Math.min(MAX_ARCMIN, theta * MARGIN));
}
