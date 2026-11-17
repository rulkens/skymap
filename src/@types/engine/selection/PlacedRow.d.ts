import type { Vec3 } from '../../math/Vec3';

/**
 * The uniform placement every focusable kind's row carries, filled once by its Layer's
 * `extractRow`, so core frames and rings any kind without reading its own fields.
 */
export type PlacedRow = {
  readonly type: string;
  readonly positionMpc: Vec3;
  /** The object's own radius: half a galaxy's diameter, a body's footprint, a structure's extent. */
  readonly radiusMpc: number;
};
