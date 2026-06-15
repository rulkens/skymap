/**
 * Project-wide fallback galaxy diameter (kpc) used whenever a real
 * size measurement is missing.
 *
 * 30 kpc is roughly the Milky Way's measured D_25; it is the value every
 * fallback path in the build pipeline and the renderer agrees on, so a
 * row that ended up with exactly this diameter can be recognised as
 * "estimated, not measured".  `galaxyDiameterKpc` returns it when its
 * absolute-magnitude input is missing or non-finite.
 */
export const DEFAULT_GALAXY_DIAMETER_KPC = 30;
