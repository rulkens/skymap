import type { DocsFocusId } from '../@types/DocsFocusId';
import type { DocsNamedId } from '../@types/DocsNamedId';
import type { DocsOrientation } from '../@types/DocsOrientation';
import type { DocsUrlParam } from '../@types/DocsUrlParam';

const NOT_WRITTEN = 'Never. It stays in the address as long as you leave it there.';
const TAKEOVER_UNKNOWN =
  'The app opens on its home view of Earth and takes the parameter out of the address. A focus or a pose in the same link is not used.';

/**
 * Everything the URL parameters page (content/docs/reference/url-parameters.mdx)
 * prints in tables and lists, which it renders from here. The `#` rows are the
 * app's HASH_PARAM_SOURCES and the lists below are its registries;
 * tests/packages/website/docsReference.test.ts fails when either side gains or
 * loses an entry. The `?` flags are read by name where they are used
 * (`hasUrlGate('dome')`), so the test finds them in the app's source text.
 * Rows are in the order the app writes the parameters into an address.
 */
export const DOCS_URL_PARAMS: readonly DocsUrlParam[] = [
  {
    name: 'focus',
    part: 'hash',
    value: 'The id of one object',
    example: 'focus=body-saturn',
    does: 'Selects the object, makes it the focus and opens on the app’s standard view of it.',
    written:
      'Yes, whenever the focus changes. Earth is the home view and is written as no parameter at all.',
    unknown: 'The app opens on its home view of Earth and takes the parameter out of the address.',
    skipsWelcome: true,
  },
  {
    name: 't',
    part: 'hash',
    value: 'An instant: a date, or a date and a time',
    example: 't=2020-12-21T18:00:00Z',
    does: 'Sets the clock to that instant and pauses it, at the speed 1 s/s.',
    written:
      'Yes, once the speed has been changed or a date set. The Now button takes it away.',
    unknown: 'Ignored: the clock runs on the present. The parameter is taken out of the address.',
    skipsWelcome: true,
  },
  {
    name: 'orientation',
    part: 'hash',
    value: 'One of four words',
    example: 'orientation=galactic',
    does: 'Chooses which way is up.',
    written: 'Yes, while it is not ecliptic. Ecliptic is where the app starts and is written as no parameter.',
    unknown: 'Ignored: up stays as it was. The parameter is taken out of the address.',
    skipsWelcome: false,
  },
  {
    name: 'exhibit',
    part: 'hash',
    value: 'The name of one exhibit',
    example: 'exhibit=solarSystem',
    does: 'Opens the exhibit.',
    written: 'Yes, while the exhibit is open.',
    unknown: TAKEOVER_UNKNOWN,
    skipsWelcome: true,
  },
  {
    name: 'tour',
    part: 'hash',
    value: 'The name of one tour',
    example: 'tour=webShowcase',
    does: 'Starts the tour at its first step.',
    written: 'Yes, while the tour plays.',
    unknown: TAKEOVER_UNKNOWN,
    skipsWelcome: true,
  },
  {
    name: 'clip',
    part: 'hash',
    value: 'The name of one camera flight',
    example: 'clip=sondermarkenFlyout',
    does: 'Plays one flight of the camera, with the clock paused while it plays.',
    written: 'Yes, while the flight plays.',
    unknown: TAKEOVER_UNKNOWN,
    skipsWelcome: true,
  },
  {
    name: 'pose',
    part: 'hash',
    value: 'A letter and a list of numbers, with commas between them',
    example: 'pose=a,0,0,0,2.1,0.35,260,0',
    does: 'Puts the camera at an exact position, without a flight.',
    written:
      'No. The app reads it once and takes it out of the address. The L key prints a link that has it.',
    unknown:
      'Ignored, with a warning in the browser’s console. A focus in the same link still opens, on its standard view.',
    skipsWelcome: true,
  },
  {
    name: 'dome',
    part: 'query',
    value: 'None',
    example: '?dome',
    does: 'Starts the app in dome mode, drawing a fisheye disc.',
    written: NOT_WRITTEN,
    unknown: 'There is none.',
    skipsWelcome: false,
  },
  {
    name: 'cinema',
    part: 'query',
    value: 'None',
    example: '?cinema',
    does: 'Leaves out every panel and button, and the welcome screen: the scene alone, with a tour’s captions. The film recorder opens the app this way.',
    written: NOT_WRITTEN,
    unknown: 'There is none.',
    skipsWelcome: true,
    development: true,
  },
  {
    name: 'gpuTimings',
    part: 'query',
    value: 'None',
    example: '?gpuTimings',
    does: 'Measures how long the graphics processor takes over each part of a frame, for the debug panel.',
    written: NOT_WRITTEN,
    unknown: 'There is none.',
    skipsWelcome: false,
    development: true,
  },
  {
    name: 'perf',
    part: 'query',
    value: 'None',
    example: '?perf',
    does: 'Takes the same measurements and hands them to the perf tool.',
    written: NOT_WRITTEN,
    unknown: 'There is none.',
    skipsWelcome: false,
    development: true,
  },
  {
    name: 'tour',
    part: 'query',
    value: 'None',
    example: '?tour',
    does: 'Adds a button to the top bar that starts “The Long Way Out”. It starts no tour by itself: that is tour after the #.',
    written: NOT_WRITTEN,
    unknown: 'There is none.',
    skipsWelcome: true,
    development: true,
  },
];

/** The values of `orientation`, with the plane each one lays flat. */
export const DOCS_ORIENTATIONS: readonly DocsOrientation[] = [
  { id: 'ecliptic', flat: 'The plane of the solar system. The app starts with it.' },
  { id: 'equatorial', flat: 'Earth’s equator, so that Polaris is up.' },
  { id: 'galactic', flat: 'The plane of the Milky Way.' },
  { id: 'supergalactic', flat: 'The plane of the local superclusters.' },
];

/** The values of `exhibit`, with the name the app gives each. */
export const DOCS_EXHIBIT_IDS: readonly DocsNamedId[] = [
  { id: 'solarSystem', name: 'Solar System' },
  { id: 'cosmicFlows', name: 'Cosmic Flows' },
  { id: 'cosmicWeb', name: 'Cosmic Web' },
  { id: 'zoneOfAvoidance', name: 'Zone of Avoidance' },
  { id: 'observableUniverse', name: 'Observable Universe' },
];

/** The values of `tour`. The search lists the first two; `demo` opens from a link only. */
export const DOCS_TOUR_IDS: readonly DocsNamedId[] = [
  { id: 'grandTour', name: 'The Long Way Out' },
  { id: 'webShowcase', name: 'Named Cosmic Web' },
  { id: 'demo', name: 'Demo Tour' },
];

/** The ways of writing the value of `focus`. */
export const DOCS_FOCUS_IDS: readonly DocsFocusId[] = [
  {
    form: 'body-<name>',
    prefix: 'body-',
    example: 'body-saturn',
    names:
      'A planet, a moon, Pluto or Charon, a spacecraft, a Mars rover, the park Søndermarken, the whale or the petunias. The names are listed below.',
  },
  {
    form: 'star-<name>',
    prefix: 'star-',
    example: 'star-sirius',
    names:
      'A star that has a name, in small letters with hyphens for spaces: star-barnards-star. The Sun is star-sun, and the stars round the black hole at the centre of the Milky Way are star-s1, star-s2 and so on.',
  },
  {
    form: 'star-<number>',
    prefix: 'star-',
    example: 'star-12345',
    names:
      'A star without a name, by its row in the star data that is loaded. The number means another star in another data size, so do not hand such a link on.',
  },
  {
    form: 'm<number>, c<number> or another short name',
    example: 'm31',
    names:
      'One of the 81 named galaxies, by its Messier or Caldwell number in small letters where it has one.',
  },
  {
    form: 'pgc-<number>',
    prefix: 'pgc-',
    example: 'pgc-2',
    names:
      'A galaxy of the GLADE or 2MRS catalogue, by its number in the Catalogue of Principal Galaxies (PGC).',
  },
  {
    form: 'sdss-<number>',
    prefix: 'sdss-',
    example: 'sdss-1237648704588349742',
    names: 'A galaxy of the SDSS catalogue, by its 19-digit SDSS object number.',
  },
  {
    form: 'pos@<right ascension>,<declination>',
    prefix: 'pos@',
    example: 'pos@0.0070,47.2745',
    names:
      'The catalogue galaxy nearest that place on the sky, if one lies within 30 arcseconds of it. Both numbers are in degrees.',
  },
  {
    form: 'milkyWay',
    prefix: 'milkyWay',
    example: 'milkyWay',
    names: 'The Milky Way.',
  },
  {
    form: 'cluster-<name>',
    prefix: 'cluster-',
    example: 'cluster-virgo-m87',
    names: 'A cluster of galaxies.',
  },
  {
    form: 'supercluster-<name>',
    prefix: 'supercluster-',
    example: 'supercluster-bulk-mscc-236',
    names: 'A supercluster.',
  },
  { form: 'void-<name>', prefix: 'void-', example: 'void-bootes-void', names: 'A void.' },
  {
    form: 'group-<name>',
    prefix: 'group-',
    example: 'group-local-group',
    names: 'A group of galaxies.',
  },
  {
    form: 'blackhole-sgr-a-star',
    prefix: 'blackhole-',
    example: 'blackhole-sgr-a-star',
    names: 'The black hole at the centre of the Milky Way. It is the only one.',
  },
];
