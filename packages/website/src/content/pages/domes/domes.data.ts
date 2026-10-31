import { REPO_URL } from '../../../data/siteIdentity';

/**
 * Degrees from the dome's zenith to the direction the camera looks: the app's `DOME_PARAMS.tiltDeg`, copied
 * because the site may not import the app; tests/packages/website/domeTilt.test.ts holds the two equal.
 */
export const DOME_TILT_DEG = 60;

/** The two ways a dome gets Skymap, row by row: what each delivers today, and the work we would do for you. */
export const DELIVERY_ROWS = [
  {
    label: 'Picture',
    live: 'Equidistant fisheye, 180 degrees',
    film: 'Equidistant fisheye, or a flat frame',
  },
  {
    label: 'Size',
    live: 'The window’s shorter side: 2,160 pixels on a 3,840 × 2,160 display',
    film: '4,096 × 4,096 pixels; flat, 3,840 × 2,160',
  },
  { label: 'Frame rate', live: 'As fast as the computer draws it', film: '30 or 60 a second; flat, 60' },
  { label: 'File', live: 'None: a browser window, full screen', film: 'H.264 in an MP4 file' },
  { label: 'Sound', live: 'None', film: 'None: narration and music come from you' },
  { label: 'Steered by', live: 'A presenter, with a mouse, keys or a phone', film: 'The flight, written ahead' },
  {
    label: 'Work for you',
    live: 'Another tilt, and labels or captions on the dome',
    film: 'Where the flight goes, how long it rests, what the captions say',
  },
] as const;

/**
 * What paid dome work may show, source by source. The terms are the sources' own, as the credits page and
 * the facts `gaia-licence` and `imagery-licences` state them: a row may be shorter, never freer.
 */
export const LICENCE_ROWS = [
  {
    source: 'Gaia stars',
    href: '/docs/data/gaia/',
    licence: 'CC BY-NC 3.0 IGO, non-commercial',
    paid: 'A request to ESA first',
  },
  {
    source: 'EOX cloud-free Earth',
    licence: 'CC BY-NC-SA 4.0, non-commercial',
    paid: 'Permission from EOX, or another Earth',
  },
  {
    source: 'Digitized Sky Survey pictures',
    licence: 'Copyrighted',
    paid: 'The holders’ written permission',
  },
  {
    source: 'Several catalogues',
    licence: 'No licence stated',
    paid: 'Checked source by source',
  },
  { source: 'Skymap’s code', href: REPO_URL, licence: 'MIT', paid: 'Free, with its licence notice' },
] as const;

export const STEPS = [
  {
    title: 'You write to us',
    text: 'Tell us about the dome or the room, the screen, the audience, and a date if there is one.',
  },
  {
    title: 'We answer with a plan',
    text: 'We say what exists today, what would be new work, and what the new work costs. Nothing is built before you agree.',
  },
  {
    title: 'We send a test',
    text: 'A short piece in your format, for you to run on your own system. A dome shows faults that a desk monitor hides.',
  },
  {
    title: 'We build and deliver',
    text: 'Files or a web address, with the list of credits your screen has to show. You review it on the dome before it opens.',
  },
];
