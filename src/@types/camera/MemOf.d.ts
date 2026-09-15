import type { SurfaceGestureMemory } from './SurfaceGestureMemory';

/** Per-`RungKind` rung-local memory shape; the world arm and the site turntable carry none. */
export type MemOf = {
  readonly absolute: null;
  readonly body: SurfaceGestureMemory;
  readonly site: null;
};
