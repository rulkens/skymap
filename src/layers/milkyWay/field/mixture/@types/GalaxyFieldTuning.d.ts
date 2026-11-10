/**
 * GalaxyFieldTuning — live-tunable knobs for the analytic field, grouped by
 * the tier that reads them. Optional on `buildGalaxyFieldMixture`; omitted,
 * the mixture reproduces today's fixed constants exactly (see
 * `DEFAULT_GALAXY_FIELD_TUNING`).
 *
 * CONTRACT: a section is replaced WHOLESALE, never merged field by field.
 * `subsystems/createGalaxyFieldModel.ts`'s nodes key on each section's
 * reference identity to decide which rebuilds a change actually needs.
 */
import type { GalaxyArmTuning } from '../../arms/@types/GalaxyArmTuning';
import type { GalaxyDiscTuning } from './GalaxyDiscTuning';
import type { GalaxyDustParams } from '../../dust/@types/GalaxyDustParams';
import type { GalaxyHiiTuning } from '../../starFormation/@types/GalaxyHiiTuning';
import type { GalaxyIsmMapFluidParams } from '../../ismMap/@types/GalaxyIsmMapFluidParams';
import type { GalaxyIsmMapParams } from '../../ismMap/@types/GalaxyIsmMapParams';
import type { GalaxyStarFormationParams } from '../../starFormation/@types/GalaxyStarFormationParams';

export type GalaxyFieldTuning = {
  readonly disc: GalaxyDiscTuning;
  readonly arms: GalaxyArmTuning;
  /** The dust tier's shape, cloud AND master toggle in one bag. */
  readonly dust: GalaxyDustParams;
  /** The seeded SF-event model driving HII placement — scene-wide like every other section rather than per-galaxy. */
  readonly starFormation: GalaxyStarFormationParams;
  readonly hii: GalaxyHiiTuning;
  /** Shared switch: whether the fluid generator writes the ISM map (`ismMap.generator`, `'none'` | `'fluid'`) — the ONLY branch point. */
  readonly ismMap: GalaxyIsmMapParams;
  /** The fluid ISM-map generator's params — live only while `ismMap.generator === 'fluid'`. */
  readonly ismMapFluid: GalaxyIsmMapFluidParams;
};
