/**
 * inputAggregator — collapse a frame's DOM gesture events into ordered steps.
 *
 * Consecutive motion of the same kind folds into one step; gesture boundaries
 * and a change of kind close the current run, so arrival ORDER survives. That
 * matters: a wheel tick between two drags changes `cam.distance`, and both the
 * orbit rate and the pan scale are derived from it — folding across the tick
 * would apply the second drag at the wrong rate.
 */

import type { InputAggregator } from '../../../@types/engine/subsystems/InputAggregator';
import type { InputGestureEvent } from '../../../@types/camera/InputGestureEvent';
import type { InputStep } from '../../../@types/camera/InputStep';
import type { Vec2 } from '../../../@types/math/Vec2';

/**
 * Exponent scale applied to `WheelEvent.deltaY`: factor = e^(deltaY · k).
 *
 * deltaY is ~±100 per notch on a mouse (pixel delta mode), ~±3–4 on a
 * high-resolution trackpad, so one notch is e^0.1 ≈ 1.105 — about 10 % per
 * step. Exponential rather than additive so the proportional step is the same
 * whether the camera sits 0.1 Mpc or 1000 Mpc out.
 */
const WHEEL_ZOOM_K = 0.001;

export function createInputAggregator(): InputAggregator {
  const steps: InputStep[] = [];

  // Baselines the anchor events set and the motion events advance. Pixels
  // carry to the next frame (a run starts where the last one ended); the
  // pinch baseline advances per event because ratios telescope, so the fold
  // is a plain multiply.
  let lastPx: Vec2 | null = null;
  let lastPinchDist = 0;

  /**
   * Extend the trailing zoom run when it has the same owner, else open one.
   * A run keeps the LAST event's cursor — the same "where the pointer ended
   * up" rule the drag runs use for `endPx`.
   */
  const foldZoom = (factor: number, duringGesture: boolean, cursorPx: Vec2 | null): void => {
    const tail = steps[steps.length - 1];
    if (tail !== undefined && tail.kind === 'zoom' && tail.duringGesture === duringGesture) {
      tail.factor *= factor;
      tail.cursorPx = cursorPx;
      return;
    }
    steps.push({ kind: 'zoom', factor, duringGesture, cursorPx });
  };

  return {
    push(event: InputGestureEvent): void {
      switch (event.kind) {
        case 'gestureStart':
        case 'gestureEnd':
          steps.push({ kind: event.kind });
          return;

        case 'dragAnchor':
          lastPx = [event.xPx, event.yPx];
          return;

        case 'dragMove': {
          // No anchor means no gesture is live — the recognizer cannot emit
          // this, but the queue stays honest rather than inventing a start.
          if (lastPx === null) return;
          const px: Vec2 = [event.xPx, event.yPx];
          const tail = steps[steps.length - 1];
          if (tail !== undefined && tail.kind === 'drag' && tail.mode === event.mode) {
            tail.endPx = px;
          } else {
            steps.push({ kind: 'drag', mode: event.mode, startPx: lastPx, endPx: px });
          }
          lastPx = px;
          return;
        }

        case 'pinchAnchor':
          lastPinchDist = event.distPx;
          return;

        case 'pinchMove':
          // Fingers spreading (distance grows) gives a ratio < 1 → the camera
          // distance shrinks → zoom in, the "stretch the world" model.
          if (lastPinchDist <= 0 || event.distPx <= 0) return;
          foldZoom(lastPinchDist / event.distPx, true, null);
          lastPinchDist = event.distPx;
          return;

        case 'wheel':
          foldZoom(Math.exp(event.deltaY * WHEEL_ZOOM_K), event.duringGesture, [
            event.xPx,
            event.yPx,
          ]);
          return;
      }
    },

    drain(): readonly InputStep[] {
      return steps.splice(0);
    },

    destroy(): void {
      steps.length = 0;
      lastPx = null;
      lastPinchDist = 0;
    },
  };
}
