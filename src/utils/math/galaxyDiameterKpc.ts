/**
 * Estimate a galaxy's physical diameter in kpc.
 *
 * v1: returns a fixed 30 kpc — close to the Milky Way's stellar disk and
 * within a factor of 2 for typical L* spirals. The renderer's apparent-size
 * threshold logic only cares about diameter to the nearest factor-of-two
 * (it's a binary "show texture or don't"), so the placeholder is fine.
 *
 * v2 (future): use the absolute B magnitude (`absMagBmag`) to scale via the
 * size-luminosity relation, roughly:
 *
 *     D = D₀ · 10^(0.2 · (M₀ − M))
 *
 * where (D₀, M₀) is a calibration pair like (30 kpc, −20.5 mag) for L*
 * galaxies.  Brighter (more negative absMag) → larger D.  We accept and
 * ignore the parameter today so callers don't need to be rewritten when
 * v2 lands.
 *
 * Why a constant default and an `input` object? Adding a magnitude argument
 * to a one-line function is silly *now*, but a structured input keeps the
 * call sites stable as the estimator grows.  When v2 lands, callers that
 * already pass `{ absMagBmag: info.absoluteMagG }` will start getting real
 * variation without any code change.
 */
export const DEFAULT_GALAXY_DIAMETER_KPC = 30;

export function galaxyDiameterKpc(input: { absMagBmag?: number }): number {
  // v2 hook: when absMagBmag becomes meaningful, branch here.  We already
  // gate on Number.isFinite so callers can pass NaN (common for galaxies
  // missing photometry) without a special case at the call site.
  if (input.absMagBmag !== undefined && Number.isFinite(input.absMagBmag)) {
    // intentionally fall through to default — see v2 note above.
  }
  return DEFAULT_GALAXY_DIAMETER_KPC;
}
