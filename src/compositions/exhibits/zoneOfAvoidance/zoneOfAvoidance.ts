/**
 * zoneOfAvoidance — the dust-band exhibit, framed just outside the Milky Way looking down the
 * galactic plane (distance: see `FRAMING_MPC` in `zoneOfAvoidance.constants.ts`). Words live in
 * `zoneOfAvoidance.copy.ts`.
 */

import { initialState as galaxyCatalogsInitialState } from '../../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { COSMIC_WEB_DENSITY_OFF } from '../utils/cosmicWebDensityOff';
import { section } from '../../../utils/exhibits/section';
import { factsKind } from '../../../components/ExhibitOverlay/kinds/factsKind';
import { proseKind } from '../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../components/ExhibitOverlay/kinds/sourcesKind';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import {
  BAND_ON,
  MILKY_WAY_WITH_MARKER,
  PICK_BAND_AND_GALAXIES,
  POSE,
} from './zoneOfAvoidance.constants';
import {
  FACTS,
  LABEL,
  LEDE,
  SOURCES,
  WHAT_YOURE_SEEING,
  WHY_IT_IS_THERE,
} from './zoneOfAvoidance.copy';

export const zoneOfAvoidance: Exhibit = {
  id: 'zoneOfAvoidance',
  label: LABEL,
  settings: {
    zoneOfAvoidance: BAND_ON,
    galaxyCatalogs: galaxyCatalogsInitialState,
    milkyWay: MILKY_WAY_WITH_MARKER,
    cosmicWebDensity: COSMIC_WEB_DENSITY_OFF,
    picking: PICK_BAND_AND_GALAXIES,
  },
  pose: POSE,
  lede: LEDE,
  body: [
    section(proseKind, WHAT_YOURE_SEEING),
    section(proseKind, WHY_IT_IS_THERE),
    section(factsKind, { facts: FACTS }),
    section(sourcesKind, SOURCES),
  ],
};
