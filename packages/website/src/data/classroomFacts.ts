import type { Fact } from '../@types/Fact';
import { REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-10-06';
const IN_REPO = 'in the skymap repository';

/**
 * What the Classroom page says the app does, spread into FACTS. Each row was
 * read from the file it cites. `tour-length` is the total `npm run tour-length`
 * prints (311 s); `io-lap` is Io's period in the element table (1.76 days)
 * divided by the clock step it names.
 */
export const CLASSROOM_FACTS: readonly Fact[] = [
  {
    id: 'tour-length',
    text: 'Left to play, “The Long Way Out” takes a little over 5 minutes.',
    source: `${REPO_BLOB}/src/data/animation/tours/grandTour.ts`,
    sourceLabel: `the tour’s timings, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'tour-keys',
    text: 'While a tour plays, the right and left arrow keys go to the next and the previous step, Space pauses it and Esc leaves it. The same controls are on screen.',
    source: `${REPO_BLOB}/src/state/input/keyboardShortcuts.ts`,
    sourceLabel: `the keyboard shortcuts, ${IN_REPO}`,
    checked: CHECKED,
    short: 'The arrow keys step back and forward, and Space pauses on a step for as long as the talk takes.',
  },
  {
    id: 'exhibit-notes',
    text: 'An exhibit prints its notes beside the view: a headline, what you are seeing, a few figures, and links to its sources.',
    source: `${REPO_BLOB}/src/components/ExhibitOverlay/ExhibitOverlay.tsx`,
    sourceLabel: `the exhibit’s layout, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'clock-speeds',
    text: 'The app’s clock has 15 speeds, from real time to 10 years of the scene for each second you wait.',
    source: `${REPO_BLOB}/src/data/time/rateLadder.ts`,
    sourceLabel: `the clock’s speeds, ${IN_REPO}`,
    checked: CHECKED,
    short: 'The scene has a clock. It runs at real time or faster, up to 10 years for each second you wait.',
  },
  {
    id: 'clock-keys',
    text: 'The ] key makes the clock faster, the [ key makes it slower, and the \\ key pauses or resumes it.',
    source: `${REPO_BLOB}/src/state/input/keyboardShortcuts.ts`,
    sourceLabel: `the keyboard shortcuts, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'ephemeris-span',
    text: 'For dates from 1900 to 2100 the planets, and the moons of Jupiter and Saturn, are placed within 1,000 km of the positions NASA’s JPL Horizons service gives. Outside those years the fit is not applied to the moons and is held at its last value for the planets.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data notes, ${IN_REPO}`,
    checked: CHECKED,
    short: 'Planets and their large moons are where they were, or will be, at the instant it shows: checked against NASA’s positions for the years 1900 to 2100.',
  },
  {
    id: 'io-lap',
    text: 'In skymap Io goes round Jupiter in 1.76 days and Europa in 3.53 days. With the clock at 6 hours per second, one lap of Io takes about 7 seconds.',
    source: `${REPO_BLOB}/src/data/bodies/orbitalElements.ts`,
    sourceLabel: `the moons’ orbits, ${IN_REPO}`,
    checked: CHECKED,
    short: 'At 6 hours per second Io, the innermost of the four, laps Jupiter in about 7 seconds.',
  },
  {
    id: 'search-scope',
    text: 'The search finds planets, moons, spacecraft, named stars, galaxies by name or catalogue number, clusters and voids, places on Earth, and the exhibits and tours.',
    source: `${REPO_BLOB}/src/components/CommandPalette/utils/rankPaletteMatches.ts`,
    sourceLabel: `what the search matches, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'search-tabs',
    text: 'Before anything is typed, the search shows picture cards in seven tabs: Highlights, Solar System, Missions, Milky Way, Galaxies, Deep Space and Tours. A card flies the camera to its object.',
    source: `${REPO_BLOB}/src/data/palette/featuredTabs.ts`,
    sourceLabel: `the search’s cards, ${IN_REPO}`,
    checked: CHECKED,
    short: 'Before anything is typed it shows picture cards to choose from.',
  },
  {
    id: 'card-on-click',
    text: 'A click or a tap on an object pins its card. The view does not move.',
    source: `${REPO_BLOB}/src/services/engine/phases/wireInput.ts`,
    sourceLabel: `the pointer handling, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'body-card',
    text: 'A planet’s card lists its radius, mass, surface gravity, day and year length, distance from the Sun, mean temperature, number of moons, axial tilt and atmosphere. All but the radius come from a fact sheet typed into the app by hand. The sheet names no source of its own; the card links to Wikipedia.',
    source: `${REPO_BLOB}/data/seeds/planet_facts.seed.json`,
    sourceLabel: `the planets’ fact sheet, ${IN_REPO}`,
    checked: CHECKED,
    short: 'A planet’s card lists its size, mass, gravity, day, year, temperature, moons and air. They are textbook values typed in by hand, so check one against another source: that is a lesson too.',
  },
  {
    id: 'card-tooltips',
    text: 'Underlined words on a card, such as “Gravity” and “Axial tilt”, open a short explanation when pointed at or focused.',
    source: `${REPO_BLOB}/src/components/InfoCard/tooltips.tsx`,
    sourceLabel: `the cards’ explanations, ${IN_REPO}`,
    checked: CHECKED,
    short: 'Underlined words on a card explain themselves when pointed at.',
  },
];
