/**
 * cosmicWeb — the MCPM filament exhibit: two Polyphorm volumes over a dark
 * field, galaxies off so the density is the only thing drawn. Words live in
 * `cosmicWeb.copy.ts`, tuned values in `cosmicWeb.constants.ts`.
 */

import { SURVEYS_OFF } from '../utils/surveysOff';
import { GALAXIES_SWITCH } from '../utils/galaxiesSwitch';
import { section } from '../../../utils/exhibits/section';
import { factsKind } from '../../../components/ExhibitOverlay/kinds/factsKind';
import { keyKind } from '../../../components/ExhibitOverlay/kinds/keyKind';
import { proseKind } from '../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../components/ExhibitOverlay/kinds/sourcesKind';
import { switchesKind } from '../../../components/ExhibitOverlay/kinds/switchesKind';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import { INFERNO_RAMP, POSE, VOLUMES_WITH_2MRS } from './cosmicWeb.constants';
import {
  FACTS,
  HOW_IT_WAS_MADE,
  KEY,
  LABEL,
  LEDE,
  SOURCES,
  WHAT_YOURE_SEEING,
} from './cosmicWeb.copy';

export const cosmicWeb: Exhibit = {
  id: 'cosmicWeb',
  label: LABEL,
  settings: { galaxyCatalogs: SURVEYS_OFF, cosmicWebDensity: VOLUMES_WITH_2MRS },
  pose: POSE,
  lede: LEDE,
  body: [
    section(proseKind, WHAT_YOURE_SEEING),
    section(switchesKind, { switches: [GALAXIES_SWITCH] }),
    section(proseKind, HOW_IT_WAS_MADE),
    section(keyKind, { ...KEY, ramp: INFERNO_RAMP }),
    section(factsKind, { facts: FACTS }),
    section(sourcesKind, SOURCES),
  ],
};
