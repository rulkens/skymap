/**
 * GALAXIES_SWITCH — the field exhibits' "Show galaxies" button: the survey rows on at boot,
 * scoped, so the famous galaxies `SURVEYS_OFF` keeps as landmarks stay put and opt-in rows
 * (the DESI patches) stay off. The bare `survey` address would flip the famous ones too, and
 * read on while only they are. Derived from the same boot record as `SURVEYS_OFF`, so a new
 * catalog joins both.
 */

import { initialState as galaxyCatalogsInitialState } from '../../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import type { ExhibitSwitch } from '../../../@types/exhibits/ExhibitSwitch';

const { items } = galaxyCatalogsInitialState;

export const GALAXIES_SWITCH: ExhibitSwitch = {
  label: 'galaxies',
  // `items` is a complete `Record<GalaxyCatalogId, …>`; Object.keys only widens its keys.
  addresses: (Object.keys(items) as (keyof typeof items)[])
    .filter((id) => id !== 'famousGalaxy' && items[id].enabled)
    .map((id) => `survey:${id}` as const),
};
