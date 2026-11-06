import type { SkyExitPush } from './SkyExitPush';
import type { SurfaceGestureMemory } from './SurfaceGestureMemory';

/** Per-`CameraArmKind` arm-local memory shape; the world arm and the site turntable carry none. */
export type MemOf = {
  readonly absolute: null;
  readonly body: SurfaceGestureMemory;
  readonly site: null;
  readonly sky: SkyExitPush;
};
