/**
 * totalStarBudget — how many sprite stars one galaxy is modelled with.
 *
 * The 20,000 floor is a hard minimum, not a taste choice: a smaller bag leaves
 * populations with single-digit counts and the disc stops reading as a disc.
 * `MilkyWayTuning`'s `starCount` slider documents the same floor.
 */
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';

export function totalStarBudget(params: GalaxyParams): number {
  return Math.max(20000, Math.floor(params.starCount || 400000));
}
