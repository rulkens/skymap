/**
 * PositionDriver — how one body's position is arrived at: authored outright,
 * propagated along a conic, or pinned to a spot on a spinning host. A derived
 * READ surface over the three authored tables, not a replacement for them —
 * `SCENE_ANCHORS` and `ORBITAL_ELEMENTS` keep their shapes and their consumers.
 */

import type { Vec3 } from '../math/Vec3';
import type { OrbitalElements } from './OrbitalElements';
import type { SurfaceFixedSite } from './SurfaceFixedSite';

export type PositionDriver =
  | { readonly kind: 'anchor'; readonly id: string; readonly positionMpc: Vec3 }
  | { readonly kind: 'orbit'; readonly id: string; readonly elements: OrbitalElements }
  | ({ readonly kind: 'surfaceFixed' } & SurfaceFixedSite);
