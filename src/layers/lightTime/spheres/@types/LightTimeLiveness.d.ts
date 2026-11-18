import type { Vec3 } from '../../../../@types/math/Vec3';

/** What the sphere pass draws from this frame. */
export type LightTimeLiveness = {
  /** Earth this frame, absolute Mpc (f64). */
  readonly centre: Readonly<Vec3>;
  /** One per `LIGHT_TIME_SPHERES` row: handed value × size fade. */
  readonly opacities: readonly number[];
};
