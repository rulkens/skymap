/**
 * voyager — both Voyagers from launch to today: their full trails, framed whole, and a
 * mission timeline that sets the clock. The captions are authored copy keyed by event id;
 * the event times and flyby distances are measured, in `MISSION_EVENTS`.
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

const CAPTIONS: Readonly<Record<string, string>> = {
  'voyager2-launch':
    'Voyager 2 launches first, on the slower path that kept Uranus and Neptune within reach.',
  'voyager1-launch':
    'Voyager 1 follows sixteen days later on a faster path and overtakes its twin by mid-December.',
  'voyager1-jupiter':
    'Voyager 1 finds active volcanoes on Io, the first seen on any world besides Earth.',
  'voyager2-jupiter':
    'Four months behind its twin, Voyager 2 takes the closest look yet at Europa’s cracked ice.',
  'voyager1-titan':
    'Voyager 1 passes Titan to study its thick haze, and the encounter sends it north out of the planets’ plane for good.',
  'voyager1-saturn':
    'Closest approach to Saturn, eighteen hours after Titan. No planet lies ahead of Voyager 1.',
  'voyager2-saturn':
    'Saturn swings Voyager 2 toward Uranus, a path open only because Voyager 1 had already covered Titan.',
  'voyager2-uranus':
    'The only spacecraft visit Uranus has had. Voyager 2 finds ten moons no one had seen.',
  'voyager2-neptune':
    'Voyager 2’s closest pass of any planet, over Neptune’s north pole. Triton follows five hours later.',
  'voyager1-pale-blue-dot':
    'From six billion kilometres, Voyager 1 photographs Earth as a dot smaller than a pixel. Its cameras are switched off 34 minutes later.',
  'voyager1-pioneer10':
    'Voyager 1 passes Pioneer 10 to become the most distant object people have made.',
  'voyager1-termination-shock':
    'Voyager 1 crosses the termination shock, where the solar wind suddenly slows.',
  'voyager2-termination-shock':
    'Voyager 2 meets the same boundary ten AU closer in, on the southern side: the bubble is not round.',
  'voyager1-heliopause':
    'Voyager 1 leaves the heliosphere, the bubble of solar wind around the Sun, and enters interstellar space.',
  'voyager2-heliopause':
    'Voyager 2 follows. Its plasma instrument still works, so it measures the crossing directly.',
};

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
      heading: 'What you’re seeing',
      text: 'Each line is one craft’s path since launch, from JPL’s tracking data. The lines grow as the clock runs and shrink when it runs back. Voyager 1, in pale gold, climbs north out of the planets’ plane after Saturn. Voyager 2, in copper, turns south after Neptune. The switch above the timeline picks which craft to follow; the other craft’s line and name dim.',
    },
    {
      kind: 'timeline',
      heading: 'Timeline',
      events: MISSION_EVENTS,
      crafts: [
        { bodyId: 'voyager1', route: 'Jupiter · Saturn · Titan' },
        { bodyId: 'voyager2', route: 'Jupiter · Saturn · Uranus · Neptune' },
      ],
      eras: [
        { label: 'Planetary · 1977–1989', fromIso: '1977-08-20' },
        { label: 'Interstellar · 1990–now', fromIso: '1990-01-01' },
      ],
      captions: CAPTIONS,
    },
    {
      kind: 'prose',
      heading: 'Why the paths part',
      text: 'In the late 1970s the outer planets lined up so that one craft could swing from each to the next, an arrangement that comes round about once every 175 years. Voyager 1 gave up that chain for a close pass of Titan, Saturn’s largest moon. Voyager 2 kept it, and reached Uranus and Neptune.',
    },
    {
      kind: 'prose',
      heading: 'The Golden Record',
      text: 'Each craft carries a 12-inch gold-plated copper record. It holds greetings in 55 languages and about 90 minutes of music, and encodes 115 images as sound. The cover shows how to play it and, using 14 pulsars, where the Sun is.',
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
