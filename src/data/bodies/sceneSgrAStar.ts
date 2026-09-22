/**
 * sceneSgrAStar — Sagittarius A*'s seed record: its registry identity.
 *
 * Its POSITION is not here: the Galactic Centre is a place
 * (`data/places/galacticCentre.ts`), and Sgr A* is what sits at it, so the
 * sky coordinates have one home and the region, the bands and the lens row
 * all key on the place rather than on this body.
 */

import { schwarzschildRadiusM } from '../../utils/physics/schwarzschildRadiusM';
import { SGR_A_STAR_ENTRY } from '../sources/sgr-a-star';
import { SGR_A_STAR_MASS_SOLAR } from './sgrAStarMassSolar';
import type { AnchorPointBody } from '../../@types/scene/AnchorPointBody';

export const SGR_A_STAR: AnchorPointBody = {
  id: SGR_A_STAR_ENTRY.id,
  label: SGR_A_STAR_ENTRY.label,
  // schwarzschildRadiusM returns metres directly.
  surface: { datumRadiusM: schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR), reliefM: [0, 0] },
  // Q10's descent floor: the camera may approach to 2 r_s, well inside the
  // Earth-tuned global SURFACE_STANDOFF_RADII (~1.0000024).
  standoffRadii: 2.0,
  // Arrival distance the user framed live (2026-09-01): ~30.4 r_s, well
  // outside the descent floor above and deep inside the lensing fade band.
  focusDistanceRadii: 30.4,
};
