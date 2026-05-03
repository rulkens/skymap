/**
 * Estimate a galaxy's physical diameter in kiloparsecs.
 *
 * v2 (this version) implements the Tully (1988) size–luminosity relation:
 *
 *   log10(R_25_kpc) = -0.249 · (M_B + 21) + 1.366
 *   D_25_kpc        = 2 · 10^log10R
 *
 * R_25 is the radius at which the B-band surface brightness drops below
 * 25 mag/arcsec² — the standard "where the galaxy looks like it ends" radius
 * astronomers quote.  The factor of 2 turns radius into diameter.
 *
 * Sanity check: M_B = -20.5 (an L* galaxy near the Milky Way's luminosity)
 *   log10R = -0.249 · 0.5 + 1.366 = 1.2415
 *   R      = 10^1.2415 ≈ 17.4 kpc
 *   D      ≈ 34.9 kpc
 * That's within 15 % of the Milky Way's measured D_25 ≈ 30 kpc — good
 * agreement for a single-relation fit across spirals + ellipticals.
 *
 * When `absMagBmag` is missing (undefined or NaN), the function returns
 * the project-wide DEFAULT_GALAXY_DIAMETER_KPC = 30 — the same value used
 * by every fallback path elsewhere in the build pipeline (see
 * `tools/buildAllBins.ts`).  Keeping the constant exported lets the
 * pipeline reuse it without re-importing the helper.
 *
 * The output is clamped to a 1 kpc floor.  Without the clamp, very faint
 * dwarfs (M_B ≈ -10) would compute D ≈ 0.16 kpc — smaller than a globular
 * cluster — and the renderer's apparent-size logic would shrink them past
 * the visibility floor entirely.  1 kpc is a defensible minimum for any
 * "object the user can call a galaxy".
 */
export const DEFAULT_GALAXY_DIAMETER_KPC = 30;

/**
 * Minimum diameter we'll ever return.  See module doc for the rationale —
 * this prevents pathological tiny numbers from collapsing the renderer's
 * apparent-size math.
 */
const MIN_DIAMETER_KPC = 1;

export function galaxyDiameterKpc(input: { absMagBmag?: number }): number {
  if (input.absMagBmag === undefined || !Number.isFinite(input.absMagBmag)) {
    return DEFAULT_GALAXY_DIAMETER_KPC;
  }
  const logR = -0.249 * (input.absMagBmag + 21) + 1.366;
  const diameter = 2 * Math.pow(10, logR);
  return Math.max(diameter, MIN_DIAMETER_KPC);
}
