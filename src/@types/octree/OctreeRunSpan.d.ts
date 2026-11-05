/** One pool buffer's span past the index: `total` entries cut into power-of-two runs, `minRun` to `maxRun`. */
export type OctreeRunSpan = {
  readonly total: number;
  readonly minRun: number;
  readonly maxRun: number;
};
