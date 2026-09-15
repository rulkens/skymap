/**
 * The world arm's up authority at a disengage (spec §4.8): out THROUGH the band
 * the roll is scene-aligned already and carries through lossless; CUT out from
 * below it, it is the site's local horizon, which nothing downstream reclaims,
 * so a cut lands on the frame pole. `northUp` off carries either way (ruling 11).
 */

import type { CameraTuning } from '../../@types/camera/CameraTuning';

export function releasedWorldRoll(rollRad: number, hOverR: number, tuning: CameraTuning): number {
  return tuning.northUp && hOverR <= tuning.disengageHR ? 0 : rollRad;
}
