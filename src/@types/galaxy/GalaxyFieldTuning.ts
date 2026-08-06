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
import type { GalaxySfMapAutomatonParams } from './GalaxyIsmMapAutomatonParams';
import type { GalaxySfMapFluidParams } from './GalaxyIsmMapFluidParams';
import type { GalaxySfMapParams } from './GalaxyIsmMapParams';

export type GalaxyFieldTuning = {
  readonly disc: GalaxyDiscTuning;
  readonly arms: GalaxyArmTuning;
  readonly dust: GalaxyDustTuning;
  readonly hii: GalaxyHiiTuning;
  /** Shared switch: which generator writes the SF map, if any (`sfMap.generator`, `'none'` | `'automaton'` | `'fluid'`) — the ONLY branch point. */
  readonly sfMap: GalaxySfMapParams;
  /** The SSPSF automaton that grows the ISM structure the dust tier is seeded from — live only while `sfMap.generator === 'automaton'`. */
  readonly sfMapAutomaton: GalaxySfMapAutomatonParams;
  /** The fluid alternative to `sfMapAutomaton` — live only while `sfMap.generator === 'fluid'`. Symmetric with it, not a fallback. */
  readonly sfMapFluid: GalaxySfMapFluidParams;
};
