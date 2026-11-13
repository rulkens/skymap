/**
 * REALM_PIGMENTS — the plate pigments (`antiqueLook/shared/pigments.wesl` indices) a
 * realm's fill may take, tried in order: verdigris, gamboge, red lead, carmine
 * first, sap green and yellow ochre only where a realm's neighbours have used
 * those up. Smalt (5) is never offered: it is the sea wash.
 */

export const REALM_PIGMENTS: readonly (readonly number[])[] = [
  [0, 2, 3, 4],
  [1, 6],
];
