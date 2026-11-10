import type { ExtraGalaxySpec } from '../../../../../@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';

/** A background galaxy's contribution: its own geometry, plus the rigid transform placing it in the scene. */
export type GalaxyFieldExtra = {
  readonly geometry: GalaxyDescription;
  readonly transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>;
};
