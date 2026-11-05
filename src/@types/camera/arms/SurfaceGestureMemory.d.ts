import type { SurfaceGesture } from './SurfaceGesture';

/** The body arm's gesture register (spec §6), replaced once per frame. */
export type SurfaceGestureMemory = {
  /** The gesture lifecycle: null = idle · 'down' = pressed, not yet latched · else latched. */
  readonly gesture: SurfaceGesture | 'down' | null;
};
