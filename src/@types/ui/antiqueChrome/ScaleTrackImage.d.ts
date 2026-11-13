/**
 * ScaleTrackImage — the scale of miles from `scaleTrackSvg`, applied as the bottom
 * edge of a `border-image`: `start` px (the subdivided first unit) and `end` px
 * (the end rule) stay whole, the middle repeats; `height` is the bar's depth.
 */
export type ScaleTrackImage = {
  readonly svg: string;
  readonly start: number;
  readonly end: number;
  readonly height: number;
};
