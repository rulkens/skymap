import type { SurfaceGestureMemory } from './SurfaceGestureMemory';

/** Per-`RungKind` rung-local memory shape; the world arm carries none. */
export type MemOf = {
  readonly absolute: null;
  readonly body: SurfaceGestureMemory;
};
