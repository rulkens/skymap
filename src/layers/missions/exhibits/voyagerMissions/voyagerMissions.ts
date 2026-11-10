/**
 * voyagerMissions — both Voyagers from launch to today: their full trails and a mission timeline whose
 * camera follows the selected craft (`missionHoldSaga`). The event times and flyby distances
 * are measured, in `MISSION_EVENTS`. Words live in `voyagerMissions.copy.ts`, tuned values in
 * `voyagerMissions.constants.ts`.
 */

import { initialState as missionsInitialState } from '../../state/missions/initialState';
import { MISSION_EVENTS } from '../../events/data/missionEvents.generated';
import { section } from '../../../../utils/exhibits/section';
import { proseKind } from '../../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../../components/ExhibitOverlay/kinds/sourcesKind';
import { missionTimelineKind } from '../timeline/missionTimelineKind';
import type { Exhibit } from '../../../../@types/exhibits/Exhibit';
import {
  CRUISE,
  GALAXY_CATALOGS_OFF,
  STARS_DIMMED_UNLABELLED,
  STRUCTURES_OFF,
} from './voyagerMissions.constants';
import {
  CRAFTS,
  LABEL,
  LEDE,
  SOURCES,
  THE_GOLDEN_RECORD,
  THE_GRAND_TOUR,
  THE_VOYAGER_MISSIONS,
  TIMELINE_HEADING,
} from './voyagerMissions.copy';

export const voyagerMissions: Exhibit = {
  id: 'voyager-missions',
  label: LABEL,
  settings: {
    orbitTrails: { enabled: true },
    missionTrails: { enabled: true },
    missions: { ...missionsInitialState, craft: CRAFTS[0]!.bodyId },
    galaxyCatalogs: GALAXY_CATALOGS_OFF,
    structures: STRUCTURES_OFF,
    starCatalogs: STARS_DIMMED_UNLABELLED,
    picking: { off: ['galaxyCatalog', 'structure', 'milkyWay', 'zoneOfAvoidance', 'satellite'] },
  },
  lede: LEDE,
  body: [
    section(proseKind, THE_VOYAGER_MISSIONS),
    section(missionTimelineKind, {
      heading: TIMELINE_HEADING,
      crafts: CRAFTS,
      events: MISSION_EVENTS.filter((e) => CRAFTS.some((c) => c.bodyId === e.bodyId)),
      cruise: CRUISE,
    }),
    section(proseKind, THE_GRAND_TOUR),
    section(proseKind, THE_GOLDEN_RECORD),
    section(sourcesKind, SOURCES),
  ],
};
