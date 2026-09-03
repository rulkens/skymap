/**
 * clampSceneDistanceM — the metre-scale distance floor/ceiling the camera rig
 * applies instead of `src/utils/camera/clampDistance`, whose
 * `MAX_DISTANCE_MPC = 30000` would read as a 30 km ceiling here.
 *
 * MIN 0.5 m (nose against a leaf), MAX 5000 m (the whole patch plus sky).
 */
const MIN_DISTANCE_M = 0.5;
const MAX_DISTANCE_M = 5000;

export function clampSceneDistanceM(distanceM: number): number {
  return Math.min(MAX_DISTANCE_M, Math.max(MIN_DISTANCE_M, distanceM));
}
