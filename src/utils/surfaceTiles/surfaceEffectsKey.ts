import type { SurfaceEffect } from '../../@types/data/SurfaceEffect';

/** The tile shader variant key for an effects set: sorted and '+'-joined, so
 *  two rows listing the same effects in another order share one pipeline. */
export function surfaceEffectsKey(effects: readonly SurfaceEffect[]): string {
  return [...effects].sort().join('+');
}
