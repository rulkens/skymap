/**
 * solarSystem — the orrery exhibit, framed from above the ecliptic. It authors a vantage, no look.
 * Words live in `solarSystem.copy.ts`, tuned values in `solarSystem.constants.ts`.
 */

import { initialState as orbitTrailsInitialState } from '../../state/orbitTrails/initialState';
import { initialState as starCatalogsInitialState } from '../../../starCatalog/state/starCatalogs/initialState';
import { section } from '../../../../utils/exhibits/section';
import { factsKind } from '../../../../components/ExhibitOverlay/kinds/factsKind';
import { proseKind } from '../../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../../components/ExhibitOverlay/kinds/sourcesKind';
import type { Exhibit } from '../../../../@types/exhibits/Exhibit';
import { POSE, STARFIELD_BRIGHTNESS } from './solarSystem.constants';
import {
  FACTS,
  HOW_IT_WAS_MADE,
  LABEL,
  LEDE,
  SOURCES,
  WHAT_YOURE_SEEING,
} from './solarSystem.copy';

export const solarSystem: Exhibit = {
  id: 'solarSystem',
  label: LABEL,
  // Trails forced on (`withSceneSnapshotSaga` restores the viewer's choice on exit). `starCatalog`
  // stays pickable because the Sun's dot is a star-catalog row.
  settings: {
    orbitTrails: { ...orbitTrailsInitialState, enabled: true },
    starCatalogs: { ...starCatalogsInitialState, brightness: STARFIELD_BRIGHTNESS },
    picking: { off: ['galaxyCatalog', 'structure', 'milkyWay', 'zoneOfAvoidance', 'satellite'] },
  },
  pose: POSE,
  lede: LEDE,
  body: [
    section(proseKind, WHAT_YOURE_SEEING),
    section(proseKind, HOW_IT_WAS_MADE),
    section(factsKind, { facts: FACTS }),
    section(sourcesKind, SOURCES),
  ],
};
