import { degToRad } from '../../utils/math/degToRad';

/** The sky view readout's rounding: finer than the compass prints, coarse enough that a still head dispatches nothing new. */
export const SKY_VIEW_STEP_RAD = degToRad(0.5);
