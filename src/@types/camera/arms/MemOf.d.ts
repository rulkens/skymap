import type { SurfaceGestureMemory } from './SurfaceGestureMemory';

/** Per-`CameraArmKind` arm-local memory shape; only the body arm carries one. */
export type MemOf = {
  readonly absolute: null;
  readonly body: SurfaceGestureMemory;
  readonly site: null;
  readonly sky: null;
};
