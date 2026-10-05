/**
 * makeSurfaceDriver — the body arm's gesture memory threaded for a fixture:
 * `surfaceStep` for the steps, the production `surfaceGestureEdge` for the two
 * pointer boundaries, so a gesture-sequence fixture reads as a sequence. It
 * does not route through `replayInput` on purpose: the unit-radius closed-form
 * fixtures here cannot pass a body radius that `replayInput` looks up in
 * `SCENE_BODIES`.
 */

import {
  surfaceStep,
  EMPTY_SURFACE_GESTURE_MEMORY,
} from '../../../src/services/camera/surfaceStep';
import { surfaceGestureEdge } from '../../../src/utils/camera/surfaceGestureEdge';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { CameraTuning } from '../../../src/@types/camera/CameraTuning';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import { EMPTY_TILT_MEMORY } from '../../../src/data/camera/emptyTiltMemory';
import type { SurfaceGestureMemory } from '../../../src/@types/camera/SurfaceGestureMemory';
import type { TiltMemory } from '../../../src/@types/camera/TiltMemory';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function makeSurfaceDriver() {
  let memory: SurfaceGestureMemory = EMPTY_SURFACE_GESTURE_MEMORY;
  let tilt: TiltMemory = EMPTY_TILT_MEMORY;
  return {
    apply: (
      arm: BodyFixedPose,
      step: InputStep,
      viewportPx: Readonly<Vec2>,
      fovYRad: number,
      bodyRadiusM: number,
      sceneUpLocal: Readonly<Vec3>,
      tuning: CameraTuning,
    ): BodyFixedPose => {
      const out = surfaceStep(memory, tilt, arm, step, {
        viewportPx,
        fovYRad,
        bodyRadiusM,
        standoffRadii: SURFACE_STANDOFF_RADII,
        groundRadiusAtM: () => bodyRadiusM,
        // No-relief fixture: tight shells, since their separation sets the
        // marcher's step cap and any slack becomes pick error (see the note in
        // surfaceStep.test.ts's CTX).
        innerBoundRadiusM: bodyRadiusM * (1 - 1e-6),
        outerBoundRadiusM: bodyRadiusM * (1 + 1e-6),
        sceneUpLocal,
        focusPivotM: null,
        tuning,
      });
      memory = out.gesture;
      tilt = out.tilt;
      return out.pose;
    },
    onGestureStart: (): void => {
      memory = surfaceGestureEdge(true);
    },
    onGestureEnd: (): void => {
      memory = surfaceGestureEdge(false);
    },
    rememberedTiltRad: (): number => tilt.rememberedTiltRad,
  };
}
