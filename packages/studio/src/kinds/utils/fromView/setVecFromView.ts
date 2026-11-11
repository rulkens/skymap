/** A Look-at point moved to the drawn camera's target, keeping its timing. */
import type { Effect } from '../../../../../../src/@types/animation/Effect';
import type { CapturedView } from '../../../@types/kinds/CapturedView';
import type { RowSubjects } from '../../../@types/rows/RowSubjects';

export function setVecFromView(step: RowSubjects['setVec'], { pose }: CapturedView): Effect {
  // The capture is absolute Mpc, so a body-fixed step becomes an absolute one.
  const { frame: _bodyFrame, ...absolute } = step;
  return { ...absolute, to: [...pose.target] };
}
