import type { ExtraGalaxySpec } from './ExtraGalaxySpec';
import type { GalaxyDescription } from './GalaxyDescription';

/** A background galaxy's contribution: its own geometry, plus the rigid transform placing it in the scene. */
export type GalaxyFieldExtra = {
  readonly geometry: GalaxyDescription;
  readonly transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>;
};
