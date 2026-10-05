import type { Fact } from '../@types/Fact';

const CHECKED = '2026-10-05';
const REPO = 'https://github.com/rulkens/skymap/blob/main';

/**
 * Every number the site shows. `source` is where a reader verifies it; `checked`
 * is when we last did. Rows whose `short` combines two facts name the second in
 * `evidence`, since a row carries one source.
 */
export const FACTS: readonly Fact[] = [
  {
    id: 'moon-distance',
    text: 'The Moon is about 1.3 light-seconds from Earth.',
    source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
    checked: CHECKED,
    evidence: 'Mean distance 384,400 km divided by the speed of light is 1.28 s.',
    short: '1.3 light-seconds',
  },
  {
    id: 'saturn-distance',
    text: 'Saturn is between 67 and 92 light-minutes from Earth, depending on where both planets are on their orbits.',
    source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html',
    checked: CHECKED,
    evidence: 'Fact sheet range 1,205.5 to 1,658.6 million km, divided by the speed of light.',
    short: '67 to 92 light-minutes',
  },
  {
    id: 'voyager1-light-day',
    text: 'Voyager 1 reaches one light-day from Earth on 18 November 2026.',
    source: 'https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/',
    checked: CHECKED,
    short: 'about one light-day',
  },
  {
    id: 'betelgeuse-distance',
    text: 'Betelgeuse is about 550 light-years away (168 parsecs, with an uncertainty of +27 and -15).',
    source: 'https://arxiv.org/abs/2006.09837',
    checked: CHECKED,
    short: 'about 550 light-years',
  },
  {
    id: 'sgr-a-distance',
    text: 'Sagittarius A* is about 26,700 light-years away (8,178 parsecs).',
    source: 'https://arxiv.org/abs/1904.05721',
    checked: CHECKED,
    short: 'about 26,700 light-years',
  },
  {
    id: 'andromeda-distance',
    text: 'Andromeda (M31) is about 2.6 million light-years away (785 kiloparsecs, with an uncertainty of 25).',
    source: 'https://arxiv.org/abs/astro-ph/0410489',
    checked: CHECKED,
    evidence: '785 kpc times 3.2616 light-years per parsec is 2.56 million light-years.',
    short: 'about 2.6 million light-years',
  },
  {
    id: 'virgo-distance',
    text: 'The Virgo cluster is about 54 million light-years away (16.5 megaparsecs).',
    source: 'https://arxiv.org/abs/astro-ph/0702510',
    checked: CHECKED,
    short: 'about 54 million light-years',
  },
  {
    id: 'neptune-voyager2',
    text: 'Voyager 2 is the only spacecraft to have visited Neptune: it launched on 20 August 1977 and flew past on 25 August 1989.',
    source: 'https://science.nasa.gov/mission/voyager/voyager-2/',
    checked: CHECKED,
    evidence: 'Launch to flyby is 12 years and 5 days.',
    short: 'Voyager 2 is the only spacecraft to have visited Neptune. It took twelve years.',
  },
  {
    id: 'proxima-distance',
    text: 'Proxima Centauri, the nearest star after the Sun, is 4.25 light-years away (Gaia parallax 768.07 milliarcseconds, uncertainty 0.05).',
    source: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Proxima+Cen',
    checked: CHECKED,
    evidence: '1 / 0.7680665 arcseconds is 1.302 parsecs, or 4.247 light-years.',
  },
  {
    id: 'voyager1-to-proxima',
    text: 'At its speed of 17.0 km/s relative to the Sun, Voyager 1 would take about 75,000 years to travel the 4.25 light-years to Proxima Centauri. It is not headed there.',
    source: 'https://science.nasa.gov/mission/voyager/voyager-1/',
    checked: CHECKED,
    evidence:
      'Speed from NASA; distance from the proxima-distance row. 4.2465 ly x 299,792.458 km/s / 17.0 km/s = 74,900 years.',
    short: 'At its present speed, Voyager 1 would need about 75,000 years to reach the nearest one.',
  },
  {
    id: 'galactic-centre-light',
    text: 'Light from the Milky Way’s centre left about 26,700 years ago. The ice sheets of the last glacial maximum were at their greatest extent from 26.5 to 19–20 thousand years ago.',
    source: 'https://doi.org/10.1126/science.1172873',
    checked: CHECKED,
    evidence: 'Distance from the sgr-a-distance row: 8,178 pc is 26,673 light-years.',
    short: 'The light from its centre left about 26,700 years ago, as the ice sheets reached their greatest extent.',
  },
  {
    id: 'andromeda-light',
    text: 'Light from Andromeda left about 2.6 million years ago. Fossils from Jebel Irhoud, Morocco, dated to 315,000 years (uncertainty 34,000), are among the oldest assigned to Homo sapiens.',
    source: 'https://doi.org/10.1038/nature22336',
    checked: CHECKED,
    evidence: 'Distance from the andromeda-distance row; fossil age from this source.',
    short: 'Light from Andromeda left about 2.6 million years ago, long before our species existed.',
  },
  {
    id: 'cosmic-web-map',
    text: 'The purple and orange glow is a density map of the cosmic web, computed by the Monte Carlo Physarum Machine from the positions of SDSS galaxies. It is a reconstruction, not an image.',
    source: 'https://arxiv.org/abs/2301.02719',
    checked: CHECKED,
    evidence: 'src/data/exhibits/cosmicWeb.ts, "How it was made".',
    short: 'The glow is a density map computed from SDSS galaxy positions, not a photograph.',
  },
  {
    id: 'survey-gaps',
    text: 'SDSS observed a little over one third of the sky, so galaxies mapped far out sit in wedges and leave the other directions dark.',
    source: 'https://www.sdss4.org/dr17/scope/',
    checked: CHECKED,
    evidence: 'docs/DATA.md on the SDSS wedge footprint.',
    short: 'The dark gaps are directions our surveys did not reach.',
  },
  {
    id: 'sondermarken-flyout',
    text: 'The “Søndermarken to the Edge” clip opens 46 metres up over Søndermarken, a park in Copenhagen, on aerial photography at 10 cm per pixel (spring 2025), and pulls back in one continuous move to the edge of the observable universe.',
    source: 'https://datafordeler.dk',
    checked: CHECKED,
    evidence:
      'src/data/animation/clips/sondermarkenFlyout.ts (opening pose, 46 m up); ATTRIBUTIONS.md, GeoDanmark orthophoto.',
  },
  {
    id: 'grand-tour-steps',
    text: '“The Long Way Out” has 14 captioned steps, from the Milky Way to the edge of the observable universe and back.',
    source: `${REPO}/src/data/animation/tours/grandTour.ts`,
    checked: CHECKED,
    evidence: 'Fourteen beats, each with a caption.',
  },
];
