/**
 * A subject-bound camera step replaced by its Fixed form at the drawn camera, keeping its timing
 * (Q23, Q-G as recommended): Look-at and Strafe become a Look-at point, Distance a distance, Turn a
 * yaw, and Aim an All of Turn and Tilt. The subject is dropped; the drawn value stays.
 */
import {
  aimAt,
  dollyTo,
  moveTarget,
  tween,
} from '../../../../../../src/services/engine/animation/effectHelpers';
import type { Effect } from '../../../../../../src/@types/animation/Effect';
import type { CapturedView } from '../../../@types/kinds/CapturedView';
import type { RowSubjects } from '../../../@types/rows/RowSubjects';

export function fixedFormOf(
  step: RowSubjects['moveTargetId' | 'strafeId' | 'dollyToId' | 'spinToId' | 'lookAtId'],
  { pose }: CapturedView,
): Effect {
  const { over, ease } = step;
  switch (step.kind) {
    case 'moveTargetId':
    case 'strafeId':
      return moveTarget([...pose.target], over, ease);
    case 'dollyToId':
      return dollyTo(pose.distance, over, ease);
    case 'spinToId':
      return tween('yaw', { to: pose.yaw, over, ease });
    case 'lookAtId':
      return aimAt({ yaw: pose.yaw, pitch: pose.pitch }, over, ease);
  }
}
