/**
 * How every still of the site is taken and written (shootSiteShots.ts,
 * shootWorkbench.ts): at twice the window, and at the qualities measured on
 * the app's frames, where AVIF 50 holds a star field and WebP needs 76 to
 * match it. `denseWebp` is the WebP of a row's `denseQuality` widths: its
 * alpha is lossy too, since the lossless alpha of a cut-out of fine points was
 * most of its bytes (the DESI spine 1.4 MB at 686); below alpha 70 the
 * filaments' faint haze bands.
 */
export const SHOT_ENCODING = {
  dpr: 2,
  avif: { quality: 50, effort: 9 },
  webp: { quality: 76, effort: 6 },
  denseWebp: { quality: 30, alphaQuality: 70, effort: 6 },
} as const;
