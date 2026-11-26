/** The 2026 QQ8 exhibit's tuned values: the timeline's end, the camera's bearing, and the quiet sky. */

import { initialState as starCatalogsInitialState } from '../../../starCatalog/state/starCatalogs/initialState';
import { initialState as galaxyCatalogsInitialState } from '../../../galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as structuresInitialState } from '../../../structure/state/structures/initialState';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../../@types/settings/StructureItemSettings';

/** Five weeks past the capture's end, so the rock is seen leaving. */
export const END_ISO = '2027-01-15T00:00:00Z';

/** High above the ecliptic (pitch positive is above), so the loop round Earth reads face on. */
export const CRUISE = { yaw: 0, pitch: 1.2 };

/** Far below Voyager's 0.3: the loop is a few Earth–Moon distances wide and must outshine the sky. */
const STARFIELD_BRIGHTNESS = 0.08;

// The same quiet sky as the Voyager exhibit (a Layer can't import another's exhibit): galaxies,
// star names and structure rings only crowd the rock's path.
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
