import { degToRad } from '../../utils/math/degToRad';

/** A search while standing never frames tighter than this lens: below it most targets' images blur.
 *  The wheel still goes down to `LENS_MIN_DEG`. */
export const SKY_SEARCH_LENS_MIN_RAD = degToRad(0.5);
