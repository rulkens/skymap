import type { Credit } from '../@types/Credit';

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

/**
 * The credits Home carries, taken from ATTRIBUTIONS.md as checked on 2026-10-07 (the full text, with the
 * acknowledgements some data releases require word for word, belongs on the
 * planned /docs/credits/ page). Each name links to its source and each licence
 * to its text.
 */
export const IMAGE_CREDITS: readonly Credit[] = [
  {
    name: 'Earth: NASA Earth Observatory, Blue Marble',
    href: 'https://visibleearth.nasa.gov/',
    licence: 'not subject to copyright in the United States',
  },
  {
    name: 'Copenhagen: Ortofoto © GeoDanmark / Klimadatastyrelsen',
    href: 'https://datafordeler.dk/dataoversigt/geodanmark-ortofoto/',
    licence: 'CC BY 4.0',
    licenceHref: CC_BY,
  },
  {
    name: 'Earth in chosen regions: EOxCloudless by EOX IT Services GmbH, containing modified Copernicus Sentinel data 2025',
    href: 'https://cloudless.eox.at',
    licence: 'CC BY-NC-SA 4.0, used with written permission from EOX',
    licenceHref: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  {
    name: 'Planets and the Moon: textures by Solar System Scope',
    href: 'https://www.solarsystemscope.com/textures/',
    licence: 'CC BY 4.0',
    licenceHref: CC_BY,
  },
];

export const DATA_CREDITS: readonly Credit[] = [
  {
    name: 'Gaia, an ESA mission processed by the Gaia DPAC',
    href: 'https://www.cosmos.esa.int/gaia',
    licence: 'CC BY-NC 3.0 IGO',
    licenceHref: 'https://www.cosmos.esa.int/web/gaia-users/license',
  },
  {
    name: 'SDSS DR17',
    href: 'https://www.sdss.org/collaboration/citing-sdss/',
    licence: 'public domain',
  },
  {
    name: '2MRS, Huchra et al. 2012',
    href: 'https://arxiv.org/abs/1108.0669',
    licence: 'no licence stated; the authors ask to be cited',
  },
  {
    name: 'GLADE v2.3, Dálya et al. 2018',
    href: 'https://arxiv.org/abs/1804.05709',
    licence: 'no licence stated; the authors ask to be cited',
  },
  {
    name: 'DESI DR1',
    href: 'https://data.desi.lbl.gov/doc/acknowledgments/',
    licence: 'CC BY 4.0',
    licenceHref: CC_BY,
  },
];
