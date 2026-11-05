import type { SurfaceGestureMemory } from './SurfaceGestureMemory';

/** Per-`CameraArmKind` arm-local memory shape; the world arm, the site turntable and the sky carry none. */
export type MemOf = {
  readonly absolute: null;
  readonly body: SurfaceGestureMemory;
  readonly site: null;
  readonly sky: null;
};
