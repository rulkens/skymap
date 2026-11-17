/**
 * ANTIQUE_MILKY_WAY_NAME_REVEAL — when the Milky Way's engraved names show. The
 * disc's diameter on screen fades them in over `discPx`, so a galaxy too small to
 * carry its arms carries none of their names; the eye's distance from the centre
 * over `outsideKpc`, so the names never wrap the sky around an eye inside the disc;
 * and the cosine between the line of sight and the disc's pole over `faceCos`, so an
 * edge-on disc, its arms stacked into one band, drops them.
 */

export const ANTIQUE_MILKY_WAY_NAME_REVEAL = {
  discPx: [420, 560],
  outsideKpc: [20, 26],
  faceCos: [0.3, 0.5],
} as const;
