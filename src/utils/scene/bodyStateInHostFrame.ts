/**
 * bodyStateInHostFrame — re-express an attached body's heliocentric
 * `BodyState` in its HOST's fixed axes, in SI metres; `posM`/`rotM` land in
 * host axes, so a mesh-local vector composed through `rotM` lands there too.
 *
 * LANDMINE: cancel the two heliocentric `positionMpc`s in Mpc FIRST, then
 * scale to metres — scaling first would inflate the shared rounding error
 * before cancellation happens; same order as `bodyRelativePose.ts:5-9`.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { Mat3 } from '../../@types/math/Mat3';
import type { BodyState } from '../../@types/scene/BodyState';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { rotateByTranspose } from '../math/rotateByTranspose';

export function bodyStateInHostFrame(
  body: BodyState,
  host: BodyState,
): { readonly posM: Vec3; readonly rotM: Mat3 } {
  const deltaMpc: Vec3 = [
    body.positionMpc[0] - host.positionMpc[0],
    body.positionMpc[1] - host.positionMpc[1],
    body.positionMpc[2] - host.positionMpc[2],
  ];
  const deltaM: Vec3 = [
    deltaMpc[0] * SCALE_UNITS.MPC_TO_M,
    deltaMpc[1] * SCALE_UNITS.MPC_TO_M,
    deltaMpc[2] * SCALE_UNITS.MPC_TO_M,
  ];
  const posM = rotateByTranspose(host.orientation, deltaM);

  // rotM = hostᵀ · body.orientation, one column at a time: each column of
  // body.orientation rotated into the host's frame the same way `posM` was.
  const col0 = rotateByTranspose(host.orientation, [
    body.orientation[0],
    body.orientation[1],
    body.orientation[2],
  ]);
  const col1 = rotateByTranspose(host.orientation, [
    body.orientation[3],
    body.orientation[4],
    body.orientation[5],
  ]);
  const col2 = rotateByTranspose(host.orientation, [
    body.orientation[6],
    body.orientation[7],
    body.orientation[8],
  ]);
  const rotM: Mat3 = [
    col0[0],
    col0[1],
    col0[2],
    col1[0],
    col1[1],
    col1[2],
    col2[0],
    col2[1],
    col2[2],
  ];

  return { posM, rotM };
}
