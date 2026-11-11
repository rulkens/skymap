/** A channel set aimed at the drawn camera's value on its channel, keeping its timing and space. */
import type { Effect } from '../../../../../../src/@types/animation/Effect';
import type { CapturedView } from '../../../@types/kinds/CapturedView';
import type { RowSubjects } from '../../../@types/rows/RowSubjects';

export function setFromView(step: RowSubjects['set'], { pose, fovYRad }: CapturedView): Effect {
  const drawn = {
    distance: pose.distance,
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll ?? 0,
    fov: fovYRad,
  };
  // The capture is absolute (Mpc, frame angles), so a body-fixed step becomes an absolute one.
  const { frame: _bodyFrame, ...absolute } = step;
  return { ...absolute, to: drawn[step.ch] };
}
