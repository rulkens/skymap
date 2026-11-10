import { DISC_SIGMA_RATIOS } from '../../mixture/data/discSurfaceFit';
import { DustDiscShape } from '../@types/DustDiscShape';

/** Component i's radial sigma, capped at the flat-model validity boundary — shared by `dustFaceOnColumn` below and `dustParticleCloud.ts`. */
export function dustSigmaR(i: number, shape: DustDiscShape): number {
  return Math.min(DISC_SIGMA_RATIOS[i]! * shape.hDust, shape.sigmaRCap);
}
