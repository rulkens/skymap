import { lerp } from '../../../src/utils/math/lerp';
import { clamp } from '../../utils/textures/clamp';
import { SGR_FEH_BOUND, SGR_FEH_OLD, SGR_FEH_OLD_STRIP_GYR } from '../data/streamsBuild.constants';

/** [Fe/H] of a Sagittarius star stripped `tStripGyr` ago (0 still bound, negative before now). */
export function sagittariusFeh(tStripGyr: number): number {
  return lerp(SGR_FEH_BOUND, SGR_FEH_OLD, clamp(-tStripGyr / SGR_FEH_OLD_STRIP_GYR, 0, 1));
}
