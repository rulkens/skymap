import type { BakedStripPoint } from './BakedStripPoint';

/** One polyline of the antique Earth map (a border, a river), resampled on the
 * sphere. `kind` and `level` follow `earth/antiqueMap/line.wesl`'s style bits. */
export type BakedStrip = {
  readonly points: readonly BakedStripPoint[];
  readonly kind: number;
  readonly level: number;
};
