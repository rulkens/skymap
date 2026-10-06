import type { SiteShot } from '../@types/SiteShot';
import type { SiteShotSettings } from '../@types/SiteShotSettings';

const WIDE = { width: 1280, height: 720 };
const TALL = { width: 720, height: 900 };
const THUMB = { width: 400, height: 400 };
// Thumbnails sit in 80 to 120 px discs: 240 covers a 3x phone and a 2x desktop.
const THUMB_WIDTHS = [240, 160];
const SUBJECT: SiteShotSettings = { hideLabels: true, hideOrbitTrails: true, hideStructures: true };
const ONE_GALAXY: SiteShotSettings = { ...SUBJECT, hideGalaxyField: true, hideCosmicWeb: true, hideZoneOfAvoidance: true };
const NOON = 't=2026-10-05T12:00:00Z';

/**
 * Every picture of the app the site publishes, apart from the flight's stills
 * (those are cut from a recording by `npm run site:media`). `npm run site:shots`
 * takes them all again from a running app. Times are pinned: light, ring tilt
 * and moon positions follow the clock. A thumbnail's caption is empty because
 * the place's name and distance are printed beside it.
 */
export const SITE_SHOTS: readonly SiteShot[] = [
  {
    id: 'earth-terminator',
    link: `focus=body-earth&${NOON}&pose=a,0,0,0,6.14,0.2,5.5e-16,0,0.25,0`,
    settings: SUBJECT,
    size: WIDE,
    widths: [1920, 1280],
    caption:
      'Earth on 5 October 2026 at 12:00 UTC. The surface is satellite photography; the clouds are a fixed composite, not that day’s weather.',
    alt: 'Earth against a dense field of stars, the Indian Ocean in daylight and night arriving from the east.',
    credit: 'Earth: NASA Blue Marble',
  },
  {
    id: 'earth-terminator-portrait',
    link: `focus=body-earth&${NOON}&pose=a,0,0,0,6.14,0.2,7.5e-16,0`,
    settings: SUBJECT,
    size: TALL,
    widths: [560],
    caption:
      'Earth on 5 October 2026 at 12:00 UTC. The surface is satellite photography; the clouds are a fixed composite, not that day’s weather.',
    alt: 'Earth against a dense field of stars, the Indian Ocean in daylight and night arriving from the east.',
    credit: 'Earth: NASA Blue Marble',
  },
  {
    id: 'hubble',
    link: 'focus=body-hubble&t=2026-09-18T13:00:12Z&pose=a,0,0,0,-1.938340168882169,0.09915032713380474,6.55234811878065e-22,0',
    settings: { ...SUBJECT, settleMs: 4000 },
    size: WIDE,
    widths: [1920, 1280],
    caption:
      'The Hubble Space Telescope off the coast of Namibia on 18 September 2026. The orbit is computed from tracking data; the telescope is a 3D model.',
    alt: 'The Hubble telescope above a cloudy Atlantic and a desert coastline, with stars beyond the edge of Earth.',
    credit: 'Model: NASA. Earth imagery: see the credits below',
  },
  {
    id: 'hubble-portrait',
    link: 'focus=body-hubble&t=2026-09-18T13:00:12Z&pose=a,0,0,0,-1.938340168882169,0.09915032713380474,9e-22,0',
    settings: { ...SUBJECT, settleMs: 4000 },
    size: TALL,
    widths: [720],
    caption:
      'The Hubble Space Telescope off the coast of Namibia on 18 September 2026. The orbit is computed from tracking data; the telescope is a 3D model.',
    alt: 'The Hubble telescope above a cloudy Atlantic, with stars beyond the edge of Earth.',
    credit: 'Model: NASA. Earth imagery: see the credits below',
  },
  {
    // About 27 s into the step the camera has pulled back to the whole field and the galaxies have faded. The
    // camera keeps turning there, so each run frames it a little differently: look at this one after a re-shoot.
    id: 'tour-cosmic-web',
    link: 'tour=grandTour',
    settings: { tourStep: 8, settleMs: 27500 },
    size: WIDE,
    widths: [1920, 1280, 800],
    caption:
      'A frame from the tour’s ninth step. The purple field is density computed from SDSS galaxy positions; the discs mark named superclusters.',
    alt: 'A purple web of threads with gold knots, ending at a straight edge, with pale discs marking superclusters.',
  },
  {
    id: 'classroom-jupiter',
    link: 'focus=body-jupiter&t=2033-03-14T21:00:00Z',
    settings: { settleMs: 5000 },
    size: { width: 1200, height: 900 },
    widths: [1200, 720],
    caption:
      'What this address opens: Jupiter on 14 March 2033 at 21:00 UTC, labels on. The ring is the app’s selection marker.',
    alt: 'Jupiter inside a white selection ring, three quarters lit, with labelled stars and galaxies behind it.',
    credit: 'Jupiter: Solar System Scope',
  },
  {
    id: 'dome-saturn',
    link: 'focus=body-saturn&t=2017-10-15T12:00:00Z',
    query: 'dome',
    settings: SUBJECT,
    size: { width: 1024, height: 1024 },
    widths: [1200, 720],
    caption:
      'A fisheye frame from the app’s dome mode: the whole sky in one disc, Saturn near the front edge. October 2017, rings wide open.',
    alt: 'A circular all-sky picture: stars and the band of the Milky Way, with Saturn and its open rings near the lower edge.',
    credit: 'Saturn: Solar System Scope',
  },
  {
    id: 'saturn',
    link: 'focus=body-saturn&t=2017-10-15T12:00:00Z&pose=a,0,0,0,3.75,0.38,9e-15,0,-0.2,0',
    settings: SUBJECT,
    size: WIDE,
    widths: [1920, 1280],
    caption:
      'Saturn on 15 October 2017, its rings wide open and the planet’s shadow across them. Position and ring tilt are computed for that date.',
    alt: 'Saturn seen from above its rings, the full ring system around it and a curved shadow on the far side.',
    credit: 'Saturn: Solar System Scope',
  },
  {
    id: 'saturn-portrait',
    link: 'focus=body-saturn&t=2017-10-15T12:00:00Z&pose=a,0,0,0,3.75,0.38,1.5e-14,0',
    settings: SUBJECT,
    size: TALL,
    widths: [560],
    caption:
      'Saturn on 15 October 2017, its rings wide open and the planet’s shadow across them. Position and ring tilt are computed for that date.',
    alt: 'Saturn seen from above its rings, the full ring system around it and a curved shadow on the far side.',
    credit: 'Saturn: Solar System Scope',
  },
  {
    id: 'galaxies-measured',
    link: 'pose=a,0,0,0,0.9,0.55,1500,0',
    settings: { hideLabels: true, hideStructures: true, hideCosmicWeb: true, settleMs: 2000 },
    size: WIDE,
    widths: [800, 640],
    caption: 'Every catalogued galaxy, from 1,500 megaparsecs out. Each point is one measured position.',
    alt: 'A glowing cloud of points with dark wedges cut out of it.',
  },
  {
    id: 'filaments-derived',
    link: 'pose=a,0,0,0,2.1,0.35,260,0',
    settings: { hideLabels: true, hideStructures: true, hideCosmicWeb: true, filaments: true, settleMs: 4000 },
    size: WIDE,
    widths: [800, 640],
    caption: 'The filaments of the cosmic web, traced through those positions by an algorithm.',
    alt: 'Bright branching violet threads spreading from a dense core across a field of galaxies.',
  },
  {
    id: 'milky-way-drawn',
    link: 'focus=milkyWay&pose=a,0,0,0,-2.22,0.6,0.04,0,0.25,0',
    settings: { ...SUBJECT, hideZoneOfAvoidance: true },
    size: WIDE,
    widths: [800, 640],
    caption: 'The Milky Way from outside. No camera has been there; this is a model.',
    alt: 'A barred spiral galaxy seen from above, with small companion galaxies around it.',
  },
  {
    id: 'void-bootes',
    link: 'focus=void-bootes-void&pose=a,-125.49,-114.98,176.24,0.6,0.3,150,0',
    // The app's label atlas has no ö, so its own label would read "Botes Void".
    settings: { hideStructureLabels: true, settleMs: 5000 },
    size: WIDE,
    widths: [1600, 960],
    caption: 'The Boötes Void in skymap. The sphere marking it is drawn; the scarcity of galaxies inside it is measured.',
    alt: 'A thin blue ring on a dark, nearly empty field.',
  },
  {
    id: 'og-card',
    link: `focus=body-earth&${NOON}&pose=a,0,0,0,6.14,0.2,6e-16,0,0.42,0`,
    settings: SUBJECT,
    size: { width: 1200, height: 630 },
    widths: [],
    caption: 'Earth on 5 October 2026 at 12:00 UTC, for the link-preview card.',
    alt: 'Earth against a dense field of stars, with the word skymap and the line: the mapped universe at true scale.',
  },
  { id: 'place-earth', link: `focus=body-earth&${NOON}`, settings: SUBJECT, size: THUMB, widths: THUMB_WIDTHS, caption: '', alt: '' },
  { id: 'place-moon', link: `focus=body-moon&${NOON}`, settings: SUBJECT, size: THUMB, widths: THUMB_WIDTHS, caption: '', alt: '' },
  { id: 'place-saturn', link: `focus=body-saturn&${NOON}`, settings: SUBJECT, size: THUMB, widths: THUMB_WIDTHS, caption: '', alt: '' },
  {
    id: 'place-voyager1',
    link: 'focus=body-voyager1&t=2026-09-18T12:56:32Z&pose=a,0,0,0,3.8408163993487223,-0.6565563346622649,2.6e-22,0',
    settings: { ...SUBJECT, settleMs: 3000 },
    size: THUMB,
    widths: THUMB_WIDTHS,
    caption: '',
    alt: '',
  },
  { id: 'place-betelgeuse', link: `focus=star-betelgeuse&${NOON}`, settings: SUBJECT, size: THUMB, widths: THUMB_WIDTHS, caption: '', alt: '' },
  {
    id: 'place-sgr-a',
    link: 'focus=blackhole-sgr-a-star',
    settings: { ...SUBJECT, fovDeg: 24 },
    size: THUMB,
    widths: THUMB_WIDTHS,
    caption: '',
    alt: '',
  },
  {
    id: 'place-andromeda',
    link: 'focus=m31&pose=a,0.57651,0.10877,0.51485,-1.0847,-0.5820,0.12,0',
    settings: { ...ONE_GALAXY, settleMs: 3000 },
    size: THUMB,
    widths: THUMB_WIDTHS,
    caption: '',
    alt: '',
  },
  { id: 'place-virgo', link: 'focus=cluster-virgo-m87', settings: SUBJECT, size: THUMB, widths: THUMB_WIDTHS, caption: '', alt: '' },
  {
    id: 'place-laniakea',
    link: 'pose=a,0,0,0,2.1,0.35,220,0',
    settings: { hideLabels: true, hideStructures: true, hideCosmicWeb: true, settleMs: 2000 },
    size: THUMB,
    widths: THUMB_WIDTHS,
    caption: '',
    alt: '',
  },
];
