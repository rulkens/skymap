/**
 * Convert an angular size in arcseconds at a given distance in megaparsecs
 * to a physical size in kiloparsecs.
 *
 * This is the standard small-angle formula:
 *
 *     physical = θ_radians × distance
 *
 * with two unit conversions: arcsec → radians (× π / (180 · 3600)) and
 * Mpc → kpc (× 1000) to land in kpc when `distanceMpc` is in Mpc.
 *
 * Why a tiny dedicated helper rather than inlining the formula in each
 * parser?  Three of the four catalog paths (2MRS Riso, SDSS petroR50_r,
 * future HyperLEDA logd25) all need this exact conversion, and getting
 * the constant wrong by a factor of 2 (radius vs diameter) or 1000 (kpc
 * vs Mpc) is silent and devastating — every galaxy ends up the wrong
 * size and the renderer just shows uniformly-tiny or uniformly-huge
 * blobs.  Centralising the conversion in one tested helper means every
 * call site is one obvious-named function call.
 *
 * Returns NaN when either input is non-finite — propagates "missing
 * measurement" through arithmetic without a special-case branch at the
 * call site.  Returns 0 when arcsec === 0 (rare but legal: a perfectly
 * unresolved point source).
 */
export function arcsecToKpc(arcsec: number, distanceMpc: number): number {
  if (!Number.isFinite(arcsec) || !Number.isFinite(distanceMpc)) return NaN;
  const RAD_PER_ARCSEC = Math.PI / (180 * 3600);
  const KPC_PER_MPC = 1000;
  return arcsec * RAD_PER_ARCSEC * distanceMpc * KPC_PER_MPC;
}
