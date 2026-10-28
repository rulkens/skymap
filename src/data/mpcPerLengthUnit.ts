import type { Length } from '../@types/data/Length';
import { SCALE_UNITS } from './scaleUnits';

/** Mpc per one of each `Length` unit; its keys are the single list of accepted units. */
export const MPC_PER_LENGTH_UNIT: Readonly<Record<Length['unit'], number>> = {
  au: SCALE_UNITS.AU_TO_MPC,
  pc: 1e-6,
  kpc: 1e-3,
  Mpc: 1,
};
