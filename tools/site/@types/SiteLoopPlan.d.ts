/**
 * How `npm run site:loops` encodes every loop: a square of `size` pixels at
 * `fps`, H.264 in MP4. A higher CRF is a smaller, softer file: encoding starts
 * at `crf`, and a file over `maxKb` is encoded again, `crfStep` higher each
 * time up to `crfCeiling`, until it fits.
 */
export type SiteLoopPlan = {
  size: number;
  fps: number;
  crf: number;
  crfStep: number;
  crfCeiling: number;
  maxKb: number;
};
