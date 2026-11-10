import { lerp } from '../../../src/utils/math/lerp';
import { clamp } from '../../utils/textures/clamp';
import {
  STREAM_POPULATION_METAL_POOR as POOR,
  STREAM_POPULATION_METAL_RICH as RICH,
} from '../data/streamsBuild.constants';

/** One particle's B−V: a star type drawn by its share of the population's light at `feh`, one draw. */
export function sampleStreamBv(feh: number, rng: () => number): number {
  const t = clamp((feh - POOR.feh) / (RICH.feh - POOR.feh), 0, 1);
  const bhbShare = lerp(POOR.bhbShare, RICH.bhbShare, t);
  const u = rng();
  if (u < bhbShare) return lerp(POOR.bhbBv, RICH.bhbBv, t);
  if (u < bhbShare + lerp(POOR.turnoffShare, RICH.turnoffShare, t)) {
    return lerp(POOR.turnoffBv, RICH.turnoffBv, t);
  }
  return lerp(POOR.giantBv, RICH.giantBv, t);
}
