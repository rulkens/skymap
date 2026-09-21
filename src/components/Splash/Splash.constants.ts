/**
 * Splash copy tables. The credit groups are the splash's public-facing
 * summary of ATTRIBUTIONS.md — the full licence terms live there, not here.
 */

import type { SplashError } from '../../@types/splash/SplashError';

export const TITLE_ID = 'splash-title';
export const BODY_ID = 'splash-body';
export const BODY_DATA_ID = 'splash-body-data';

// aria-describedby takes an ID *list* — both body paragraphs describe the
// dialog, and reusing one id on both would silently drop the second.
export const DESCRIBED_BY = `${BODY_ID} ${BODY_DATA_ID}`;

// Keyed by SplashError['kind'] — the project's >2-way rule: a Record scales
// to a new error kind by adding a row, not another ternary branch.
export const ERROR_COPY: Record<SplashError['kind'], string> = {
  'webgpu-init-failed':
    'WebGPU failed to initialize on this device. Try reloading, or use a recent version of Chrome or Edge.',
  'catalog-fetch-failed':
    'Failed to load the galaxy data. Check your connection and try reloading.',
  'data-version-mismatch': 'Skymap was updated — reload the page to fetch matching data',
};

// Rendered as "<label> (<name>, <name>), <label> (…)" — order is the sentence's.
export const CREDIT_GROUPS = [
  {
    label: 'galaxy surveys',
    sources: [
      { name: 'SDSS', url: 'https://www.sdss.org/' },
      { name: 'GLADE', url: 'https://glade.elte.hu/' },
      { name: '2MRS', url: 'https://lambda.gsfc.nasa.gov/product/2mass/' },
      { name: 'Milliquas', url: 'https://heasarc.gsfc.nasa.gov/W3Browse/all/milliquas.html' },
      { name: 'DESI DR1', url: 'https://data.desi.lbl.gov/' },
    ],
  },
  {
    label: 'stars',
    sources: [
      { name: 'Gaia DR3', url: 'https://www.cosmos.esa.int/web/gaia/dr3' },
      { name: 'Hipparcos-2', url: 'https://cdsarc.cds.unistra.fr/viz-bin/cat/I/311' },
    ],
  },
  {
    label: 'Earth',
    sources: [
      { name: 'Blue Marble', url: 'https://visibleearth.nasa.gov/collection/1484/blue-marble' },
      { name: 'EOX Sentinel-2', url: 'https://cloudless.eox.at' },
    ],
  },
  {
    label: 'orbits',
    sources: [{ name: 'JPL', url: 'https://ssd.jpl.nasa.gov/' }],
  },
] as const;
