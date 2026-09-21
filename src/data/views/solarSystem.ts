/**
 * solarSystem — the orrery view: orbit rings and planets, framed from above
 * the ecliptic. Unlike the two field views this one authors no look, only a
 * vantage; the scene it wants is the app's own default scene.
 */

import { initialState as orbitTrailsInitialState } from '../../layers/body/state/orbitTrails/initialState';
import { SCALE_UNITS } from '../scaleUnits';
import type { View } from '../../@types/views/View';

/**
 * Far enough out that Neptune's 30 AU orbit clears the frame edge. The pose is
 * written in AU because that is the unit the system is legible in; `distance`
 * itself is Mpc, like every other pose.
 */
const FRAMING_AU = 42;

/**
 * Looking DOWN on the ecliptic, about 34°. Negative because pitch is the aim
 * direction's component along the frame's up axis (`orbitAnglesLookingAlong`),
 * so a camera above the plane aims below it. Yaw is arbitrary — the system is
 * near enough symmetric about its pole that no bearing is the right one.
 */
const ECLIPTIC_TILT_RAD = -0.6;

export const solarSystem: View = {
  id: 'solarSystem',
  label: 'Solar System',
  // The trails are the view: a viewer who switched them off in the panel still
  // gets them here, and `runTakeover`'s snapshot hands their choice back on exit.
  settings: { orbitTrails: { ...orbitTrailsInitialState, enabled: true } },
  pose: {
    target: [0, 0, 0],
    yaw: 0,
    pitch: ECLIPTIC_TILT_RAD,
    distance: FRAMING_AU * SCALE_UNITS.AU_TO_MPC,
  },
  lede: 'One star, eight planets, and mostly distance. The Sun holds about 99.8% of the mass; the rest is spread across orbits that take from 88 days to 165 years.',
  body: [
    {
      kind: 'prose',
      heading: 'What you’re seeing',
      text: 'The rings are the planets’ orbits and the planets sit on them, moving as the clock runs. The four inner orbits are crowded around the centre: Mercury is 0.39 times Earth’s distance from the Sun, Neptune thirty times it. Most of what the view shows is the gap between the two groups.',
    },
    {
      kind: 'prose',
      heading: 'How it was made',
      text: 'The orbits come from JPL’s table of approximate Keplerian elements — six numbers per planet, plus the rate each of them drifts per century. The same six place the planet and draw its ring, so a planet always sits on its own orbit rather than near it.',
    },
    {
      kind: 'facts',
      facts: [
        { label: 'Planets', value: '8' },
        { label: 'Sun’s share of mass', value: '99.8%' },
        { label: 'Innermost orbit', value: '0.39 AU' },
        { label: 'Outermost orbit', value: '30 AU' },
      ],
    },
    {
      kind: 'sources',
      heading: 'Sources',
      links: [
        {
          role: 'Data',
          title: 'Keplerian elements for approximate positions of the major planets',
          citation: 'JPL Solar System Dynamics',
          href: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
        },
      ],
    },
  ],
};
