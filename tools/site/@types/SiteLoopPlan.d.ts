/**
 * How `npm run site:loops` encodes every loop: a square of `size` pixels at
 * `fps`, once as AV1 in WebM and once as H.264 in MP4 for browsers without
 * AV1. A higher CRF is a smaller, softer file: each codec starts at its CRF
 * here and a file over `maxKb` is encoded again, `crfStep` higher each time,
 * until it fits.
 */
export type SiteLoopPlan = {
  size: number;
  fps: number;
  av1Crf: number;
  h264Crf: number;
  crfStep: number;
  maxKb: number;
};
