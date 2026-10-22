/**
 * AnchorBody — a scene body whose position is authored, not derived from
 * `OrbitalElements`: the root of a focus graph rather than one of its leaves.
 */

import type { Vec3 } from '../math/Vec3';
import type { SceneBodyId } from './SceneBodyId';
import type { PlaceId } from './PlaceId';

export type AnchorBody = {
  readonly id: SceneBodyId | PlaceId;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
};
