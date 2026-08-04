/**
 * GalaxyFieldTuning — live-tunable knobs for the analytic field, grouped by
 * the tier that reads them. Optional on `buildGalaxyFieldMixture`; omitted,
 * the mixture reproduces today's fixed constants exactly (see
 * `DEFAULT_GALAXY_FIELD_TUNING`).
 *
 * CONTRACT: a section is replaced WHOLESALE, never merged field by field.
 * `createGalaxyModel`'s `setFieldTuning` reads reference identity per section
 * to decide which rebuilds a change actually needs.
 */
import type { GalaxyArmTuning } from './GalaxyArmTuning';
import type { GalaxyDiscTuning } from './GalaxyDiscTuning';
import type { GalaxyDustTuning } from './GalaxyDustTuning';
import type { GalaxyHiiTuning } from './GalaxyHiiTuning';
import type { GalaxySfMapParams } from './GalaxySfMapParams';

export type GalaxyFieldTuning = {
  readonly disc: GalaxyDiscTuning;
  readonly arms: GalaxyArmTuning;
  readonly dust: GalaxyDustTuning;
  readonly hii: GalaxyHiiTuning;
  /** The SSPSF automaton that grows the ISM structure the dust tier is seeded from. */
  readonly sfMap: GalaxySfMapParams;
};
