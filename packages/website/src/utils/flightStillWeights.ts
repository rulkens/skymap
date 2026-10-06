import type { FlightPose } from '../@types/FlightPose';

/**
 * How much of each stop's still shows at a pose, summing to one: the still of
 * the stop just passed gives way to the next one's over the whole leg between
 * them, eased so each is nearly alone at its own stop. Past the last stop its
 * still stays.
 */
export function flightStillWeights(pose: FlightPose, stills: number): number[] {
  const weights = new Array<number>(stills).fill(0);
  const from = Math.min(pose.index, stills - 1);
  const mix = from + 1 < stills ? pose.travel * pose.travel * (3 - 2 * pose.travel) : 0;
  weights[from] = 1 - mix;
  if (mix > 0) weights[from + 1] = mix;
  return weights;
}
