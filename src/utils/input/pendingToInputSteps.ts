/**
 * pendingToInputSteps — the frame's one conversion from the `input` slice's
 * unit steps to the pixel `InputStep`s the camera step consumes.
 *
 * Drag deltas are read in units of the SOURCE's height (`dx · aspect`), so a
 * 9:16 remote moves isotropically on a 16:9 view; on the canvas's own surface
 * that is today's pixel delta exactly. A navigator drag carries the same
 * isotropic pixel delta, not a pointer: the navigator integrates velocity.
 */

import type { InputStep } from '../../@types/camera/InputStep';
import type { PendingStep } from '../../@types/input/PendingStep';
import type { Vec2 } from '../../@types/math/Vec2';
import { NAV_INTENT_AXIS } from '../../data/input/navIntentAxis';
import { unitToViewPx } from './unitToViewPx';

export function pendingToInputSteps(
  pending: readonly PendingStep[],
  viewPx: Readonly<Vec2>,
): InputStep[] {
  const steps: InputStep[] = [];
  for (const step of pending) {
    if (step.kind === 'start') steps.push({ kind: 'gestureStart' });
    else if (step.kind === 'end') steps.push({ kind: 'gestureEnd' });
    else if (step.intent === 'zoom') {
      steps.push({
        kind: 'zoom',
        factor: step.ratio,
        duringGesture: step.held,
        cursorPx: step.at === null ? null : unitToViewPx(step.at, viewPx),
      });
    } else if (step.intent === 'orbit' || step.intent === 'pan') {
      // A drag always carries its pointer: the body arm casts a ray through it.
      if (step.at === null) continue;
      const start = {
        x: step.at.x - (step.dx * step.aspect * viewPx[1]) / viewPx[0],
        y: step.at.y - step.dy,
      };
      steps.push({
        kind: 'drag',
        mode: step.intent,
        startPx: unitToViewPx(start, viewPx),
        endPx: unitToViewPx(step.at, viewPx),
      });
    } else {
      steps.push({
        kind: 'navDrag',
        axis: NAV_INTENT_AXIS[step.intent],
        deltaPx: [step.dx * step.aspect * viewPx[1], step.dy * viewPx[1]],
      });
    }
  }
  return steps;
}
