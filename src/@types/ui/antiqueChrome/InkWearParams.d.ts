/**
 * InkWearParams — how unevenly a plate printed, in CSS px: `wobble` is the largest
 * sideways shift of a line (hand-cut, slightly off true), `grain` the noise
 * frequency of the ink take. Ink thins where that noise passes `thinAt` and is
 * gone `breakSpan` above it, so raising `thinAt` makes breaks rarer. Read by `inkWearSvg`.
 */
export type InkWearParams = {
  readonly wobble: number;
  readonly wobbleFrequency: number;
  readonly grain: number;
  readonly thinAt: number;
  readonly breakSpan: number;
};
