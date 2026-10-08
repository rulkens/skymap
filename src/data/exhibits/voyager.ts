/**
 * voyager — both Voyagers from launch to today: their full trails, framed whole, and a
 * mission timeline that sets the clock. The event times and flyby
 * distances are measured, in `MISSION_EVENTS`.
 */

import { initialState as orbitTrailsInitialState } from '../../state/settings/core/orbitTrails/initialState';
import { initialState as starCatalogsInitialState } from '../../layers/starCatalog/state/starCatalogs/initialState';
import { MISSION_EVENTS } from '../missions/missionEvents.generated';
import { SCALE_UNITS } from '../scaleUnits';
import type { Exhibit } from '../../@types/exhibits/Exhibit';

/** Held down so the trails read against the sky, as in the solar-system exhibit. */
const STARFIELD_BRIGHTNESS = 0.3;

/**
 * The whole mission: Voyager 1 is about 172 AU out and the sphere that fits both
 * trails is a little larger. A flyby's bend is sub-pixel at this scale; the timeline
 * says when it happened, the visitor zooms in to see how.
 */
const FRAMING_RADIUS_AU = 190;

/**
 * Looking along the cross product of the two craft's outbound headings (2026), so both
 * trails lie across the view and the fork reads as a split rather than foreshortened.
 * Derived through `orbitAnglesLookingAlong`; pitch is lifted from the exact 6° to 15°.
 */
const YAW = -1.9305;
const PITCH = 0.26;

export const voyager: Exhibit = {
  id: 'voyager',
  label: 'Voyager',
  settings: {
    orbitTrails: { ...orbitTrailsInitialState, enabled: true, emphasis: 'voyager1' },
    starCatalogs: { ...starCatalogsInitialState, brightness: STARFIELD_BRIGHTNESS },
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
  // The mission clock already moves the scene; a turning camera distracts from it.
  drift: false,
  fitRadiusMpc: FRAMING_RADIUS_AU * SCALE_UNITS.AU_TO_MPC,
  pose: {
    target: [0, 0, 0],
    yaw: YAW,
    pitch: PITCH,
    distance: FRAMING_RADIUS_AU * 3 * SCALE_UNITS.AU_TO_MPC,
  },
  lede: 'Two spacecraft launched sixteen days apart in 1977. Between them they passed all four giant planets, and both still send data from beyond the edge of the solar wind.',
  body: [
    {
      kind: 'prose',
      heading: 'The Voyager missions',
      text: 'NASA sent the twin Voyagers to study Jupiter and Saturn up close. Voyager 2 went on to Uranus and Neptune. Since 1989 both have been on an interstellar mission, measuring where the Sun’s influence ends and what lies beyond it.',
    },
    {
      kind: 'timeline',
      heading: 'Timeline',
      events: MISSION_EVENTS,
      crafts: [
        { bodyId: 'voyager1' },
        { bodyId: 'voyager2' },
      ],
      eras: [
        { label: 'Planetary · 1977–1989', fromIso: '1977-08-20' },
        { label: 'Interstellar · 1990–now', fromIso: '1990-01-01' },
      ],
    },
    {
      kind: 'prose',
      heading: 'The Grand Tour',
      text: 'In the late 1970s the outer planets lined up in a way that comes round about once every 175 years, so one craft could swing from each giant to the next. Voyager 2 flew the whole route. Voyager 1 left it for a close look at Titan.',
    },
    {
      kind: 'prose',
      heading: 'The Golden Record',
      text: 'Each craft carries a gold-plated record of greetings in 55 languages, 90 minutes of music and 115 images. Its cover uses 14 pulsars to show where the Sun is.',
    },
    {
      kind: 'facts',
      facts: [
        { label: 'Launched', value: '1977' },
        { label: 'Giant planets passed', value: '4' },
        { label: 'Heliopause', value: '121 · 119 AU' },
        { label: 'Leaving the Sun at', value: '17 · 15 km/s' },
      ],
    },
    {
      kind: 'sources',
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
    },
  ],
};
