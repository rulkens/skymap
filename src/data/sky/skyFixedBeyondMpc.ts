import { SCALE_UNITS } from '../scaleUnits';

/**
 * Beyond this range (1000 AU) a target's direction holds over a day: it is fixed on the sky, and
 * its declination alone says whether it ever rises (D8). Nearer, its own motion counts.
 */
export const SKY_FIXED_BEYOND_MPC = 1000 * SCALE_UNITS.AU_TO_MPC;
