/**
 * solarSystem — the orrery exhibit, framed from above the ecliptic. It authors a vantage, no look.
 */

import { initialState as orbitTrailsInitialState } from '../state/orbitTrails/initialState';
import { initialState as starCatalogsInitialState } from '../../starCatalog/state/starCatalogs/initialState';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { section } from '../../../utils/exhibits/section';
import { factsKind } from '../../../components/ExhibitOverlay/kinds/factsKind';
import { proseKind } from '../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../components/ExhibitOverlay/kinds/sourcesKind';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';

/** Starfield exposure trim (1.0 is the shader baseline); held down so the thin conics read against the sky. */
const STARFIELD_BRIGHTNESS = 0.3;

/** Far enough out that Neptune's 30 AU orbit clears the frame edge; `distance` itself is Mpc. */
const FRAMING_AU = 42;

/** About 34° above the ecliptic. POSITIVE: `pitch = asin(-forward.y)` and `-forward` points target to EYE. */
const ECLIPTIC_TILT_RAD = 0.6;

export const solarSystem: Exhibit = {
  id: 'solarSystem',
  label: 'Solar System',
  // Trails forced on (`withSceneSnapshotSaga` restores the viewer's choice on exit). `starCatalog`
  // stays pickable because the Sun's dot is a star-catalog row.
  settings: {
    orbitTrails: { ...orbitTrailsInitialState, enabled: true },
    starCatalogs: { ...starCatalogsInitialState, brightness: STARFIELD_BRIGHTNESS },
    picking: {
      kinds: {
        body: true,
        craft: true,
        earthScene: true,
        starCatalog: true,
        galaxyCatalog: false,
        structure: false,
        milkyWay: false,
        zoneOfAvoidance: false,
        blackHole: true,
      },
    },
  },
  pose: {
    target: [0, 0, 0],
    yaw: 0,
    pitch: ECLIPTIC_TILT_RAD,
    distance: FRAMING_AU * SCALE_UNITS.AU_TO_MPC,
  },
  lede: 'One star, eight planets, and mostly distance. The Sun holds about 99.8% of the mass; the rest is spread across orbits that take from 88 days to 165 years.',
  body: [
    section(proseKind, {
      heading: 'What you’re seeing',
      text: 'The rings are the planets’ orbits and the planets sit on them, moving as the clock runs. The four inner orbits are crowded around the centre: Mercury is 0.39 times Earth’s distance from the Sun, Neptune thirty times it. Most of what the view shows is the gap between the two groups.',
    }),
    section(proseKind, {
      heading: 'How it was made',
      text: 'The orbits come from JPL’s table of approximate Keplerian elements — six numbers per planet, plus the rate each of them drifts per century. The same six place the planet and draw its ring, so a planet always sits on its own orbit rather than near it.',
    }),
    section(factsKind, {
      facts: [
        { label: 'Planets', value: '8' },
        { label: 'Sun’s share of mass', value: '99.8%' },
        { label: 'Innermost orbit', value: '0.39 AU' },
        { label: 'Outermost orbit', value: '30 AU' },
      ],
    }),
    section(sourcesKind, {
      heading: 'Sources',
      links: [
        {
          role: 'Data',
          title: 'Keplerian elements for approximate positions of the major planets',
          citation: 'JPL Solar System Dynamics',
          href: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
        },
      ],
    }),
  ],
};
