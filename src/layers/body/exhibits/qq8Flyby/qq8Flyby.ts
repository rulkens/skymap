/**
 * qq8Flyby — asteroid 2026 QQ8's months near Earth on a timeline whose camera keeps the rock and
 * Earth in frame (`timelineHoldSaga`). Words and dated events live in `qq8Flyby.copy.ts`, tuned
 * values in `qq8Flyby.constants.ts`.
 */

import { BODY_SAMPLED_TRAIL_ROWS } from '../../sampledTrails/data/bodySampledTrailRows';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { section } from '../../../../utils/exhibits/section';
import { proseKind } from '../../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../../components/ExhibitOverlay/kinds/sourcesKind';
import { timelineKind } from '../../../../components/ExhibitOverlay/kinds/timelineKind';
import type { Exhibit } from '../../../../@types/exhibits/Exhibit';
import {
  CRUISE,
  END_ISO,
  GALAXY_CATALOGS_OFF,
  STARS_DIMMED_UNLABELLED,
  STRUCTURES_OFF,
} from './qq8Flyby.constants';
import {
  CAPTURED,
  EVENTS,
  LABEL,
  LANE,
  LEDE,
  MOON_OR_BELT,
  SIZE_FROM_BRIGHTNESS,
  SOURCES,
  TIMELINE_HEADING,
} from './qq8Flyby.copy';

export const qq8Flyby: Exhibit<'qq8Flyby'> = {
  id: 'qq8Flyby',
  label: LABEL,
  settings: {
    orbitTrails: { enabled: true },
    galaxyCatalogs: GALAXY_CATALOGS_OFF,
    structures: STRUCTURES_OFF,
    starCatalogs: STARS_DIMMED_UNLABELLED,
    timeline: { lane: LANE.bodyId, speed: 1 },
    picking: {
      off: ['galaxyCatalog', 'structure', 'milkyWay', 'zoneOfAvoidance', 'satellite', 'asteroid'],
    },
  },
  lede: LEDE,
  body: [
    section(proseKind, CAPTURED),
    section(timelineKind, {
      heading: TIMELINE_HEADING,
      // The lane's colour is the rock's trail tint, so panel and scene share one source.
      lanes: [
        { ...LANE, color: findByIdOrThrow(BODY_SAMPLED_TRAIL_ROWS, LANE.bodyId, 'qq8Flyby').color },
      ],
      events: EVENTS,
      endIso: END_ISO,
      cruise: CRUISE,
    }),
    section(proseKind, SIZE_FROM_BRIGHTNESS),
    section(proseKind, MOON_OR_BELT),
    section(sourcesKind, SOURCES),
  ],
};
