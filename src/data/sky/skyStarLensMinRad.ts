import { degToRad } from '../../utils/math/degToRad';

/** A star search never zooms tighter than this lens (D4): a point has no size to frame, so it keeps its neighbours. */
export const SKY_STAR_LENS_MIN_RAD = degToRad(10);
