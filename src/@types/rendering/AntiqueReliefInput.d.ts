/**
 * AntiqueReliefInput — one frame's values for the relief pass's record
 * (`shaders/antiqueLook/relief.wesl` holds the byte map). Everything is in the
 * engraved body's fixed axes, metres, about the eye: the frame of the body row
 * whose depth the pass reads.
 */

import type { Vec3 } from '../math/Vec3';
import type { Size } from './Size';

export type AntiqueReliefInput = {
  /** The body row's proj·view (`Slab.vp`), f64, built about the eye. */
  readonly vp: Float64Array;
  /** Eye − body centre, f64. */
  readonly eyeRelBodyM: Readonly<Vec3>;
  readonly datumRadiusM: number;
  /** Unit vector toward the Sun. */
  readonly sun: Readonly<Vec3>;
  readonly size: Size;
  /** Device px per print unit. */
  readonly unitPx: number;
  /** Radians per device px at the view centre. */
  readonly radPerPx: number;
  /** The plate light's elevation from orbit (`ANTIQUE_PLATE_LIGHT_ELEVATION_DEG` by default). */
  readonly lightElevationDeg: number;
};
