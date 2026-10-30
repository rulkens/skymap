import type { BodyRegionId } from '../../data/BodyRegionId';
import type { PositionedId } from '../../scene/PositionedId';

/** One named distance window on a visibility entry, measured on the camera's distance from
 *  `from`: a region's anchor, or a positioned body at its live position (omitted: the render
 *  origin, where the Sun sits). Edges are Mpc in increasing distance; an omitted edge is full
 *  on that side. */
export type EntryBand = {
  /** Fades in as the distance grows: 0 at `in[0]`, full at `in[1]`. */
  readonly in?: readonly [number, number];
  /** Fades out as the distance grows: full at `out[0]`, 0 at `out[1]`. */
  readonly out?: readonly [number, number];
  readonly from?: BodyRegionId | PositionedId;
  /** The entry's items this band applies to; omitted = every item (or the entry). */
  readonly items?: readonly string[];
};
