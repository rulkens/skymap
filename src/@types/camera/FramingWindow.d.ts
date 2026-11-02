/**
 * FramingWindow — half-angle tangents of the area a framed subject must fit,
 * symmetric about the view axis. Framing reads this, never the lens: the lens
 * sets rates, the window says how much of it a subject may fill.
 */
export type FramingWindow = {
  readonly tanHalfX: number;
  readonly tanHalfY: number;
};
