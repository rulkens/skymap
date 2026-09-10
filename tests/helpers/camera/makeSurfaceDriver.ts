/**
 * makeSurfaceDriver — `replayInput`'s memory edges as a test driver: it holds the
 * `SurfaceMemory` the engine holds in `cameraRuntime.surface` and replays the
 * same three writes (the fold's returned memory, and the two `pointerDown`
 * boundaries), so gesture-sequence fixtures read as sequences instead of
 * threading a value by hand through every step.
 */

import { surfaceStep, EMPTY_SURFACE_MEMORY } from '../../../src/services/camera/surfaceStep';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
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
    ): BodyFixedPose => {
      const out = surfaceStep(memory, arm, step, {
        viewportPx,
        fovYRad,
        bodyRadiusM,
        sceneUpLocal,
      });
      memory = out.next;
      return out.pose;
    },
    onGestureStart: (): void => {
      memory = { ...memory, pointerDown: true, gesture: null };
    },
    onGestureEnd: (): void => {
      memory = { ...memory, pointerDown: false, gesture: null };
    },
    rememberedTiltRad: (): number => memory.rememberedTiltRad,
  };
}
