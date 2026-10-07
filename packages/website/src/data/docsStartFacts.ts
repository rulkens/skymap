import type { Fact } from '../@types/Fact';
import { REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-10-07';
const IN_REPO = 'in the skymap repository';

/**
 * What the two Start pages of the docs say the app does and holds, spread into
 * FACTS. Each row was read from the file it cites, and the rows the tutorial
 * prints were also done by hand in the running app on the check date. Counts
 * are of that file's entries: 24 `satelliteBody` calls, 10 mesh seeds, 118
 * stars and 40 orbits. What the Guide pages already state is cited from
 * docsGuideFacts.ts, not said again here.
 */
export const DOCS_START_FACTS: readonly Fact[] = [
  // First flight
  {
    id: 'start-welcome',
    about: 'app',
    text: 'On a first visit the app opens on a welcome screen with two buttons. Explore closes it. Tour starts “The Long Way Out”.',
    source: `${REPO_BLOB}/src/components/Splash/Splash.tsx`,
    sourceLabel: `the welcome screen, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'start-about-button',
    about: 'app',
    text: 'The About button in the top bar opens the welcome screen again.',
    source: `${REPO_BLOB}/src/components/containers/TopBarContainer.tsx`,
    sourceLabel: `the top row’s buttons, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'start-clock-now',
    about: 'app',
    text: 'The scene starts on the present and runs at real speed. Shift+N, or the Now button on the clock, puts it back there.',
    source: `${REPO_BLOB}/src/state/time/timeSlice.ts`,
    sourceLabel: `the clock’s state, ${IN_REPO}`,
    checked: CHECKED,
  },

  // What is in the scene
  {
    id: 'scene-bodies',
    about: 'app',
    text: 'The solar system in skymap is the Sun, the eight planets, Pluto and 24 moons: the Moon, Phobos and Deimos, four moons of Jupiter, seven of Saturn, six of Uranus, three of Neptune, and Charon.',
    source: `${REPO_BLOB}/src/data/bodies/scenePlanets.ts`,
    sourceLabel: `the list of planets and moons, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-not-here',
    about: 'app',
    text: 'There are no asteroids or comets in the scene, no dwarf planet other than Pluto, and no planets of other stars.',
    source: `${REPO_BLOB}/src/data/bodies/scenePlanets.ts`,
    sourceLabel: `the list of planets and moons, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-rings',
    about: 'app',
    text: 'Saturn has the only rings in the scene.',
    source: `${REPO_BLOB}/src/data/bodies/sceneRings.ts`,
    sourceLabel: `the list of ring systems, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-models',
    about: 'app',
    text: 'Seven spacecraft are in the scene as 3D models: Voyager 1, Voyager 2, the Hubble Space Telescope, and the Mars rovers Spirit, Opportunity, Curiosity and Perseverance. There are three other models: Søndermarken, a park in Copenhagen, and a whale and a bowl of petunias in orbit around Earth.',
    source: `${REPO_BLOB}/src/data/bodies/sceneMeshBodies.ts`,
    sourceLabel: `the list of 3D models, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-probe-orbits',
    about: 'app',
    text: 'Voyager 1, Voyager 2 and Hubble move on orbital elements copied from JPL Horizons in September 2026.',
    source: `${REPO_BLOB}/src/data/bodies/orbitalElements.ts`,
    sourceLabel: `the orbital elements, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-rovers',
    about: 'app',
    text: 'Each rover stands where it is now or where its mission ended.',
    source: `${REPO_BLOB}/src/data/bodies/surfaceFixedSites.ts`,
    sourceLabel: `the rover sites, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-named-stars',
    about: 'app',
    text: 'The app labels 118 stars by name.',
    source: `${REPO_BLOB}/data/seeds/famous_stars.seed.json`,
    sourceLabel: `the list of named stars, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-s-stars',
    about: 'app',
    text: 'Forty stars move around Sagittarius A* on orbits published from years of tracking them.',
    source: `${REPO_BLOB}/src/data/bodies/sStarElements.ts`,
    sourceLabel: `the orbits of those stars, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-constellations',
    about: 'app',
    text: 'Lines for the 88 constellations join the stars at their catalogued distances, so the figures come apart as the camera leaves the Sun. They are off at first.',
    source: `${REPO_BLOB}/src/layers/constellations/layer.ts`,
    sourceLabel: `the constellation lines, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-structure-kinds',
    about: 'app',
    text: 'The 42 structures placed by hand are 15 clusters, 16 groups of galaxies, 8 superclusters and 3 voids.',
    source: `${REPO_BLOB}/data/seeds/structure_anchors.seed.json`,
    sourceLabel: `the hand-placed structures, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-desi-off',
    about: 'app',
    text: 'The three DESI regions are off at first.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/state/galaxyCatalogs/initialState.ts`,
    sourceLabel: `the catalogues’ starting state, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'scene-filaments-off',
    about: 'app',
    text: 'The filaments are off at first.',
    source: `${REPO_BLOB}/src/layers/cosmicWebFilaments/state/cosmicWebFilaments/initialState.ts`,
    sourceLabel: `the filaments’ starting state, ${IN_REPO}`,
    checked: CHECKED,
  },
];
