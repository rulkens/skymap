/**
 * OrbitTrailView — the per-frame view values every orbit-trail draw shares, so a Layer's pass
 * hands one value to `drawOrbitConics` instead of the frame's whole context.
 */

import type { Vec2 } from '../../math/Vec2';
import type { Vec3 } from '../../math/Vec3';
import type { OrbitTrailDrawArgs } from './OrbitTrailDrawArgs';

export type OrbitTrailView = {
  /** `view.slab.vp`, NEVER `view.vp` (see `orbitTrailView`). */
  readonly slabVp: Float64Array;
  readonly viewportPx: Readonly<Vec2>;
  /** The eye (`ctx.drawCamPos`), not the orbit target. */
  readonly eyeMpc: Readonly<Vec3>;
  readonly pxPerRad: number;
  readonly occluders: OrbitTrailDrawArgs['occluders'];
  readonly depth: OrbitTrailDrawArgs['depth'];
  readonly showImpostor: boolean;
};
