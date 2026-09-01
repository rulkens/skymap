/**
 * ScalarFieldPaletteId — the set of colour palettes the scalar-volume
 * renderer can apply to a `ScalarCube`.
 *
 * Sequential ramps (viridis, magma, inferno, blue-purple, yellow-green)
 * are perceptually-uniform and suit data with a meaningful zero at the
 * low end (voids transparent).  `coolwarm` is divergent — blue → neutral
 * → red with V-shaped alpha — designed for fields centred on a meaningful
 * zero where voids and overdensities are equally interesting.
 */
export type ScalarFieldPaletteId =
  | 'viridis'
  | 'magma'
  | 'inferno'
  | 'blue-purple'
  | 'yellow-green'
  /**
   * Divergent blue → neutral → red, with V-shaped alpha (visible at
   * both ends, transparent at the midpoint).  Designed for fields
   * centered on a meaningful zero — CF-4 density contrast, residual
   * peculiar-velocity divergence, anything where voids and overdensities
   * are equally interesting and the cosmic mean should fade out.
   * Inspired by matplotlib's `coolwarm` / `bwr` colour scheme.
   */
  | 'coolwarm'
  /**
   * Polyphorm's shipped gradient set (vendor `bin/data/palette_*.tga`,
   * sampled into anchors — see POLYPHORM_RAMPS in scalarFieldPalettes.ts).
   * `magma-poly` is their `palette_magma.tga`, renamed to keep matplotlib's
   * `magma` id: the two diverge at the top end (pure yellow vs cream).
   */
  | 'blue'
  | 'cliff3'
  | 'coldhot'
  | 'eagle'
  | 'eagle2'
  | 'gogh-blue'
  | 'gogh-green'
  | 'hot'
  | 'magma-poly'
  | 'magneto2'
  | 'sunset2'
  | 'sunset3'
  | 'tropico'
  | 'vaneyck-green'
  | 'vaneyck-red';
