/** A crater the look names (`ANTIQUE_MOON_PLACES`), as a row of the crater table. */
export type MoonNamedCrater = {
  /** Row in `MoonCraterTable`. */
  readonly index: number;
  /** Apparent diameter (device px) from which its name shows (`ANTIQUE_MOON_PLACE_REVEAL`). */
  readonly revealPx: number;
};
