/**
 * cosmicFlows — the CF4++ peculiar-velocity exhibit: flow ribbons alone, with
 * the galaxies and the dust band out of the way so the current is the only
 * thing moving. Words live in `cosmicFlows.copy.ts`, tuned values in `cosmicFlows.constants.ts`.
 */

import { initialState as flowInitialState } from '../../../layers/flow/state/flow/initialState';
import { initialState as zoneOfAvoidanceInitialState } from '../../../layers/zoneOfAvoidance/state/zoneOfAvoidance/initialState';
import { SURVEYS_OFF } from '../utils/surveysOff';
import { GALAXIES_SWITCH } from '../utils/galaxiesSwitch';
import { COSMIC_WEB_DENSITY_OFF } from '../utils/cosmicWebDensityOff';
import { section } from '../../../utils/exhibits/section';
import { factsKind } from '../../../components/ExhibitOverlay/kinds/factsKind';
import { keyKind } from '../../../components/ExhibitOverlay/kinds/keyKind';
import { proseKind } from '../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../components/ExhibitOverlay/kinds/sourcesKind';
import { switchesKind } from '../../../components/ExhibitOverlay/kinds/switchesKind';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import { ARRIVAL, FLOW_SPEED_RAMP, MILKY_WAY_WITH_MARKER, POSE } from './cosmicFlows.constants';
import {
  FACTS,
  HOW_IT_WAS_MADE,
  KEY,
  LABEL,
  LANIAKEA,
  LEDE,
  SOURCES,
  WHAT_YOURE_SEEING,
} from './cosmicFlows.copy';

export const cosmicFlows: Exhibit = {
  id: 'cosmicFlows',
  label: LABEL,
  settings: {
    flow: { ...flowInitialState, enabled: true },
    galaxyCatalogs: SURVEYS_OFF,
    milkyWay: MILKY_WAY_WITH_MARKER,
    cosmicWebDensity: COSMIC_WEB_DENSITY_OFF,
    zoneOfAvoidance: { ...zoneOfAvoidanceInitialState, enabled: false },
  },
  pose: POSE,
  arrival: ARRIVAL,
  lede: LEDE,
  body: [
    section(proseKind, WHAT_YOURE_SEEING),
    section(switchesKind, { switches: [GALAXIES_SWITCH] }),
    section(proseKind, HOW_IT_WAS_MADE),
    section(proseKind, LANIAKEA),
    section(keyKind, { ...KEY, ramp: FLOW_SPEED_RAMP }),
    section(factsKind, { facts: FACTS }),
    section(sourcesKind, SOURCES),
  ],
};
