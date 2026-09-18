import type { GroundSample } from '../../../textures/GroundSample';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

/**
 * seatHeightM — the ground height to place a site at so the posed body rests
 * on `samples` without sinking into any. The runtime pose is fixed: origin
 * `liftM` RADIALLY above that height, tilted about the origin onto `upEnu`, so
 * the wheel plane is `(X − origin)·up = −liftM`. Solving it through each
 * sample and keeping the highest seats the body on its highest contact.
 */
export function seatHeightM(
  samples: readonly GroundSample[],
  upEnu: Readonly<Vec3>,
  liftM: number,
): number {
  const [upE, upN, upU] = upEnu;
  let best = -Infinity;
  for (const { eastM, northM, heightM } of samples) {
    best = Math.max(best, heightM - liftM + (upE * eastM + upN * northM + liftM) / upU);
  }
  return best;
}
