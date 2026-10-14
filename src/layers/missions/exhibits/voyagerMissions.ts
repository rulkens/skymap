/**
 * voyagerMissions — both Voyagers from launch to today: their full trails and a mission timeline whose
 * camera follows the selected craft (`missionHoldSaga`). The event times and flyby distances
 * are measured, in `MISSION_EVENTS`.
 */

import { initialState as missionsInitialState } from '../state/missions/initialState';
import { initialState as starCatalogsInitialState } from '../../starCatalog/state/starCatalogs/initialState';
import { initialState as galaxyCatalogsInitialState } from '../../galaxyCatalog/state/galaxyCatalogs/initialState';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../@types/settings/GalaxyCatalogItemSettings';
import { initialState as structuresInitialState } from '../../structure/state/structures/initialState';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../@types/settings/StructureItemSettings';
import { MISSION_EVENTS } from '../../../data/missions/missionEvents.generated';
import { section } from '../../../utils/exhibits/section';
import { proseKind } from '../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../components/ExhibitOverlay/kinds/sourcesKind';
import { missionTimelineKind } from './timeline/missionTimelineKind';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import type { MissionTimeline } from '../../../@types/exhibits/MissionTimeline';

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

const CRAFTS = [
  { bodyId: 'voyager1', label: 'Voyager 1' },
  { bodyId: 'voyager2', label: 'Voyager 2' },
];

const VOYAGER_TIMELINE: MissionTimeline = {
  heading: 'Timeline',
  crafts: CRAFTS,
  events: MISSION_EVENTS.filter((e) => CRAFTS.some((c) => c.bodyId === e.bodyId)),
  cruise: { yaw: YAW, pitch: PITCH },
};

export const voyagerMissions: Exhibit = {
  id: 'voyager-missions',
  label: 'The Voyager missions',
  settings: {
    orbitTrails: { enabled: true },
    missions: { ...missionsInitialState, trails: true, craft: CRAFTS[0]!.bodyId },
    // Galaxies, star names and structure rings are landmarks for other scales; here they only
    // crowd the craft.
    galaxyCatalogs: {
      ...galaxyCatalogsInitialState,
      items: Object.fromEntries(
        Object.keys(galaxyCatalogsInitialState.items).map((id) => [
          id,
          { enabled: false, labelEnabled: false },
        ]),
      ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
    },
    structures: {
      items: Object.fromEntries(
        Object.keys(structuresInitialState.items).map((id) => [
          id,
          { enabled: false, labelEnabled: false },
        ]),
      ) as Record<StructureId, StructureItemSettings>,
    },
    starCatalogs: {
      ...starCatalogsInitialState,
      brightness: STARFIELD_BRIGHTNESS,
      items: {
        ...starCatalogsInitialState.items,
        gaiaStars: { enabled: true, labelEnabled: false },
        famousStar: { enabled: true, labelEnabled: false },
        sStar: { enabled: true, labelEnabled: false },
      },
    },
    picking: {
      kinds: {
        body: true,
        starCatalog: true,
        galaxyCatalog: false,
        structure: false,
        milkyWay: false,
        zoneOfAvoidance: false,
        blackHole: true,
      },
    },
  },
  lede: 'Two spacecraft launched sixteen days apart in 1977. Between them they passed all four giant planets, and both still send data from beyond the edge of the solar wind.',
  body: [
    section(proseKind, {
      heading: 'The Voyager missions',
      text: 'NASA sent the twin Voyagers to study Jupiter and Saturn up close. Voyager 2 went on to Uranus and Neptune. Since 1989 both have been on an interstellar mission, measuring where the Sun’s influence ends and what lies beyond it.',
    }),
    section(missionTimelineKind, VOYAGER_TIMELINE),
    section(proseKind, {
      heading: 'The Grand Tour',
      text: 'In the late 1970s the outer planets lined up in a way that comes round about once every 175 years, so one craft could swing from each giant to the next. Voyager 2 flew the whole route. Voyager 1 left it for a close look at Titan.',
    }),
    section(proseKind, {
      heading: 'The Golden Record',
      text: 'Each craft carries a gold-plated record of greetings in 55 languages, 90 minutes of music and 115 images. Its cover uses 14 pulsars to show where the Sun is.',
    }),
    section(sourcesKind, {
      heading: 'Sources',
      links: [
        {
          role: 'Data',
          title: 'Horizons System, Voyager 1 (−31) and 2 (−32) vectors',
          citation: 'JPL Solar System Dynamics',
          href: 'https://ssd.jpl.nasa.gov/horizons/',
        },
        {
          role: 'Mission',
          title: 'Voyager mission',
          citation: 'NASA Science',
          href: 'https://science.nasa.gov/mission/voyager/',
        },
        {
          role: 'Heliopause',
          title: 'In situ observations of interstellar plasma with Voyager 1',
          citation: 'Gurnett et al. 2013, Science 341:1489',
          href: 'https://doi.org/10.1126/science.1241681',
        },
        {
          role: 'Record',
          title: 'The Golden Record',
          citation: 'NASA/JPL',
          href: 'https://science.nasa.gov/mission/voyager/golden-record/',
        },
      ],
    }),
  ],
};
