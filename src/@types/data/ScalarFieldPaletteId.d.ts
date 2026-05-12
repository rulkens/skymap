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
  | 'coolwarm';
