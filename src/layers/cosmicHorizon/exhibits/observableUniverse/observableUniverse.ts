/**
 * observableUniverse — the whole horizon shell in frame, everything catalogued
 * reduced to the knot at its centre. `fitRadiusMpc` re-derives `pose.distance` at fly
 * time (`exhibitBodySaga.ts`) so the sphere fits the live viewport at any aspect.
 * Words live in `observableUniverse.copy.ts`, tuned values in `observableUniverse.constants.ts`.
 */

import { section } from '../../../../utils/exhibits/section';
import { factsKind } from '../../../../components/ExhibitOverlay/kinds/factsKind';
import { proseKind } from '../../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../../components/ExhibitOverlay/kinds/sourcesKind';
import type { Exhibit } from '../../../../@types/exhibits/Exhibit';
import { HORIZON_RADIUS_MPC } from '../../horizon/data/horizonRadiusMpc';
import { POSE } from './observableUniverse.constants';
import {
  FACTS,
  LABEL,
  LEDE,
  SOURCES,
  WHAT_YOURE_SEEING,
  WHY_46_BILLION,
} from './observableUniverse.copy';

export const observableUniverse: Exhibit = {
  id: 'observableUniverse',
  label: LABEL,
  settings: { cosmicHorizon: { enabled: true } },
  fitRadiusMpc: HORIZON_RADIUS_MPC,
  pose: POSE,
  lede: LEDE,
  body: [
    section(proseKind, WHAT_YOURE_SEEING),
    section(proseKind, WHY_46_BILLION),
    section(factsKind, { facts: FACTS }),
    section(sourcesKind, SOURCES),
  ],
};
