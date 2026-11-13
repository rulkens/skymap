/** This frame's part of the `MoonPrint` record (`packMoonPrint`). */
export type MoonPrintFrame = {
  /** Device px per print unit. */
  readonly unitPx: number;
  /** Device px per radian at the view axis. */
  readonly focalPx: number;
  /** The Moon's radius, m. */
  readonly radiusM: number;
  /** One tile's size, device px (`binMoonCraters`). */
  readonly tilePx: readonly [number, number];
  /** Two u32 of ring mask per tile, row-major (`binMoonCraters`). */
  readonly tiles: Uint32Array;
};
