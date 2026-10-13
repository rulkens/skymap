import type { Credit } from '../@types/Credit';

/**
 * The short credits a landing page carries under its pictures. The wording is
 * ours, for a footer; the full text, with the acknowledgements some releases
 * require word for word, is the credits page, generated from ATTRIBUTIONS.md.
 * `entry` names each row's entry there, and tests/packages/website/credits.test.ts
 * fails when a row states a licence its entry does not, or reads freer than
 * the entry's `Use` terms. Each name links to its source.
 */
export const IMAGE_CREDITS: readonly Credit[] = [
  {
    entry: 'nasa-blue-marble',
    name: 'Earth: NASA Earth Observatory, Blue Marble',
    href: 'https://visibleearth.nasa.gov/',
    licence: 'generally not subject to copyright in the United States, as NASA states',
  },
  {
    entry: 'geodanmark',
    name: 'Copenhagen: Ortofoto © GeoDanmark / Klimadatastyrelsen',
    href: 'https://datafordeler.dk/dataoversigt/geodanmark-ortofoto/',
    licence: 'CC BY 4.0',
  },
  {
    entry: 'eox',
    name: 'Earth in chosen regions: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
    href: 'https://cloudless.eox.at',
    licence: 'CC BY-NC-SA 4.0, non-commercial, used with written permission from EOX',
  },
  {
    entry: 'solar-system-scope',
    name: 'Planets and the Moon: textures by Solar System Scope',
    href: 'https://www.solarsystemscope.com/textures/',
    licence: 'CC BY 4.0',
  },
];

export const DATA_CREDITS: readonly Credit[] = [
  {
    entry: 'gaia',
    name: 'Gaia, an ESA mission processed by the Gaia DPAC',
    href: 'https://www.cosmos.esa.int/gaia',
    licence: 'CC BY-NC 3.0 IGO, non-commercial',
  },
  {
    entry: 'sdss',
    name: 'SDSS DR17',
    href: 'https://www.sdss4.org/collaboration/citing-sdss/',
    licence: 'public domain, as SDSS states',
  },
  {
    entry: '2mrs',
    name: '2MRS, Huchra et al. 2012',
    href: 'https://arxiv.org/abs/1108.0669',
    licence: 'no licence stated, by the authors or by CDS, which serves our copy for use in a scientific context',
  },
  {
    entry: 'glade',
    name: 'GLADE v2.3, Dálya et al. 2018',
    href: 'https://arxiv.org/abs/1804.05709',
    licence: 'no licence stated (© Gergely Dálya); the authors ask to be cited',
  },
  {
    entry: 'desi',
    name: 'DESI DR1',
    href: 'https://data.desi.lbl.gov/doc/acknowledgments/',
    licence: 'CC BY 4.0',
  },
];
