/** The Voyager missions exhibit's tuned values: what it hides and dims, and the cruise bearing. */

import { initialState as starCatalogsInitialState } from '../../../starCatalog/state/starCatalogs/initialState';
import { initialState as galaxyCatalogsInitialState } from '../../../galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as structuresInitialState } from '../../../structure/state/structures/initialState';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../../@types/settings/StructureItemSettings';

/** Held down so the trails read against the sky, as in the solar-system exhibit. */
const STARFIELD_BRIGHTNESS = 0.3;

/**
 * Looking along the cross product of the two craft's outbound headings (2026), so both
 * trails lie across the view and the fork reads as a split rather than foreshortened.
 * Derived through `orbitAnglesLookingAlong`; pitch is lifted from the exact 6° to 15°.
 * The mission camera's cruise view takes this bearing.
 */
const YAW = -1.9305;
const PITCH = 0.26;

export const CRUISE = { yaw: YAW, pitch: PITCH };

// Galaxies, star names and structure rings are landmarks for other scales; here they only
// crowd the craft.
export const GALAXY_CATALOGS_OFF = {
  ...galaxyCatalogsInitialState,
  items: Object.fromEntries(
    Object.keys(galaxyCatalogsInitialState.items).map((id) => [
      id,
      { enabled: false, labelEnabled: false },
    ]),
  ) as typeof galaxyCatalogsInitialState.items,
};

export const STRUCTURES_OFF = {
  items: Object.fromEntries(
    Object.keys(structuresInitialState.items).map((id) => [
      id,
      { enabled: false, labelEnabled: false },
    ]),
  ) as Record<StructureId, StructureItemSettings>,
};

export const STARS_DIMMED_UNLABELLED = {
  ...starCatalogsInitialState,
  brightness: STARFIELD_BRIGHTNESS,
  items: {
    ...starCatalogsInitialState.items,
    gaiaStars: { enabled: true, labelEnabled: false },
    famousStar: { enabled: true, labelEnabled: false },
    sStar: { enabled: true, labelEnabled: false },
  },
};
