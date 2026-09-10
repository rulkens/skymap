import type { SurfaceGesture } from './SurfaceGesture';

/**
 * The body arm's gesture memory (spec §6), replaced once per frame: the latched
 * gesture (dies at pointerup) + the session's remembered tilt (ruling 12).
 */
export type SurfaceMemory = {
  /** The gesture lifecycle: null = idle · 'down' = pressed, not yet latched · else latched. */
  readonly gesture: SurfaceGesture | 'down' | null;
  /** Radians, un-mapped through the band weight; 0 until a tilt/look drag sets it. */
  readonly rememberedTiltRad: number;
  readonly memoryBodyId: string | null;
};
