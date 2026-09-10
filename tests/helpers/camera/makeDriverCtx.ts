/**
 * makeDriverCtx — the `DriverCtx` a driver-level fixture hands `pose`. Defaults
 * are the inert values (no notch, nothing elapsed) so each test names only the
 * fields its row reads.
 */

import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { worldArmOf } from '../../fixtures/worldArmOf';
import type { DriverCtx } from '../../../src/@types/engine/camera/DriverCtx';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { RootState } from '../../../src/store/types';

const NEUTRAL_REGISTER: FramedCameraPose = absoluteArm({
  target: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  distance: 1,
});

export function makeDriverCtx(
  args: { readonly state: RootState } & Partial<Omit<DriverCtx, 'state'>>,
): DriverCtx {
  const register = args.register ?? NEUTRAL_REGISTER;
  return {
    state: args.state,
    elapsedMs: args.elapsedMs ?? 0,
    register,
    authoredWorld: args.authoredWorld ?? worldArmOf(register),
    winnerLastFrame: args.winnerLastFrame ?? 'resting',
    simDays: args.simDays ?? CONST_J2000,
    projection: args.projection ?? { fovYRad: 1, aspect: 1, near: 0.01, far: 50000 },
    followDistanceTarget: args.followDistanceTarget ?? null,
  };
}
