/**
 * PositionDriver — how one body's position is arrived at: authored outright,
 * propagated along a conic, read off a loaded ephemeris track, or pinned to a spot on a spinning host. A derived
 * READ surface over the composed body rows (the orbit arm carries their `correction` and
 * `reflex`), not a replacement for them.
 */

import type { Vec3 } from '../math/Vec3';
import type { OrbitalElements } from './OrbitalElements';
import type { EphemerisCorrection } from './EphemerisCorrection';
import type { BarycentricReflex } from './BarycentricReflex';
import type { SurfaceFixedSite } from './SurfaceFixedSite';
import type { SceneBodyId } from './SceneBodyId';
import type { PositionedId } from './PositionedId';

export type PositionDriver =
  | { readonly kind: 'anchor'; readonly id: PositionedId; readonly positionMpc: Vec3 }
  | {
      readonly kind: 'orbit';
      readonly id: SceneBodyId;
      readonly elements: OrbitalElements;
      readonly correction?: EphemerisCorrection;
      readonly reflex?: BarycentricReflex;
    }
  | { readonly kind: 'sampled'; readonly id: SceneBodyId; readonly focusId: SceneBodyId & 'sun' }
  | ({ readonly kind: 'surfaceFixed' } & SurfaceFixedSite);
