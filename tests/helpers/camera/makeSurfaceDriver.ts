/**
 * makeSurfaceDriver — the body arm's gesture memory threaded for a fixture:
 * `surfaceStep` for the steps, the production `surfaceGestureEdge` for the two
 * pointer boundaries, so a gesture-sequence fixture reads as a sequence. It
 * does not route through `replayInput` on purpose: the unit-radius closed-form
 * fixtures here cannot pass a body radius that `replayInput` looks up in
 * `SCENE_BODIES`.
 */

import { surfaceStep, EMPTY_SURFACE_MEMORY } from '../../../src/services/camera/surfaceStep';
import { surfaceGestureEdge } from '../../../src/utils/camera/surfaceGestureEdge';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { CameraTuning } from '../../../src/@types/camera/CameraTuning';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { SurfaceMemory } from '../../../src/@types/camera/SurfaceMemory';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function makeSurfaceDriver(seed: SurfaceMemory = EMPTY_SURFACE_MEMORY) {
  let memory = seed;
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
      const out = surfaceStep(memory, arm, step, {
        viewportPx,
        fovYRad,
        bodyRadiusM,
        sceneUpLocal,
        tuning,
      });
      memory = out.next;
      return out.pose;
    },
    onGestureStart: (): void => {
      memory = surfaceGestureEdge(memory, true);
    },
    onGestureEnd: (): void => {
      memory = surfaceGestureEdge(memory, false);
    },
    rememberedTiltRad: (): number => memory.rememberedTiltRad,
  };
}
