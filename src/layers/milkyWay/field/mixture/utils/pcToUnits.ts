/**
 * Parsecs to generator world units, at the placement's own scale:
 * `MILKY_WAY_MODEL_SCALE` is Mpc per unit (17.5 kpc over the preset's
 * outerRadius of 10.5, so 1 unit = 1.6667 kpc). Reading it rather than a
 * literal keeps pc-sized features the size the model matrix draws them at.
 */
import { MILKY_WAY_MODEL_SCALE } from '../../../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';

const PC_PER_UNIT = MILKY_WAY_MODEL_SCALE * 1e6;

export function pcToUnits(pc: number): number {
  return pc / PC_PER_UNIT;
}
