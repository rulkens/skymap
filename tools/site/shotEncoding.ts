/**
 * How every still of the site is taken and written (shootSiteShots.ts,
 * shootWorkbench.ts): at twice the window, and at the qualities measured on
 * the app's frames, where AVIF 50 holds a star field and WebP needs 76 to
 * match it.
 */
export const SHOT_ENCODING = {
  dpr: 2,
  avif: { quality: 50, effort: 9 },
  webp: { quality: 76, effort: 6 },
} as const;
