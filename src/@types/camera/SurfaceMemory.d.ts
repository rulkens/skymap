import type { SurfaceGesture } from './SurfaceGesture';

/**
 * The body arm's gesture memory (spec §6), replaced once per frame: the latched
 * gesture (dies at pointerup) + the session's remembered tilt (ruling 12).
 */
export type SurfaceMemory = {
  readonly gesture: SurfaceGesture | null;
  /** Pointer down: `gesture` stays null until the first drag step carries the press pixel. */
  readonly pointerDown: boolean;
  /** Radians, un-mapped through the band weight; 0 until a tilt/look drag sets it. */
  readonly rememberedTiltRad: number;
  readonly memoryBodyId: string | null;
};
