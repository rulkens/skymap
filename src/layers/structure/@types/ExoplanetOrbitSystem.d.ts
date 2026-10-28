/** One planet host's known orbits, for the close-approach orbit diagram. */
export type ExoplanetOrbitSystem = {
  /** Tilt of the shared orbital plane to our sky, 90 = edge-on; null when unmeasured. */
  readonly inclinationDeg: number | null;
  /** Conservative habitable zone, inner and outer edge in au; null without a luminosity. */
  readonly habitableZoneAu: readonly [number, number] | null;
  readonly planets: readonly {
    readonly name: string;
    readonly semiMajorAxisAu: number;
    readonly periodDays: number;
    /** A transit midpoint (BJD), which fixes the phase; null for a non-transiting planet. */
    readonly transitJd: number | null;
  }[];
};
