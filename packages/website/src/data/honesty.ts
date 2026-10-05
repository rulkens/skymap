import type { HonestyItem } from '../@types/HonestyItem';
import { REPO_BLOB } from './siteIdentity';

type Honesty = {
  measured: readonly HonestyItem[];
  derived: readonly HonestyItem[];
  drawn: readonly HonestyItem[];
};

/**
 * "What is measured, what is derived, what is drawn" on Home, after docs/science.md
 * ("Measured, derived, or modelled") and ATTRIBUTIONS.md. Measured: an instrument
 * recorded it. Derived: computed from measurements by a stated method, so the
 * algorithm and its assumptions matter. Drawn: a model or a rendering choice,
 * with no per-object measurement behind it. `href` is the source or method
 * behind the line; the figures (H0, the GLADE share, the 30 Mpc cut, the 1,000 km
 * ephemeris bound) are the ones in the code and docs/DATA.md.
 */
export const HONESTY: Honesty = {
  measured: [
    {
      text: 'Star positions and parallaxes, from Gaia',
      href: 'https://www.cosmos.esa.int/web/gaia/dr3',
    },
    {
      text: 'Galaxy sky positions and spectroscopic redshifts, from SDSS',
      href: 'https://www.sdss4.org/dr17/scope/',
    },
    {
      text: 'Positions and spectroscopic redshifts of nearer galaxies, from 2MRS',
      href: 'https://arxiv.org/abs/1108.0669',
    },
    {
      text: 'Earth’s surface, from satellite and aerial photographs',
      href: '#credits',
    },
  ],
  derived: [
    {
      text: 'Star distances: statistical estimates from Gaia parallaxes',
      href: 'https://arxiv.org/abs/2012.05220',
    },
    {
      text: 'Galaxy distances: computed from redshift, with a Hubble constant of 70 km/s per megaparsec',
      href: `${REPO_BLOB}/src/utils/math/constants.ts`,
    },
    {
      text: 'That constant is uncertain: measurements run from 67 to 73, so far galaxies could be 4 percent nearer or farther',
      href: 'https://arxiv.org/abs/1807.06209',
    },
    {
      text: 'Galaxies within 30 megaparsecs: distances from Cosmicflows-4 or HyperLEDA instead',
      href: 'https://projets.ip2i.in2p3.fr/cosmicflows/',
    },
    {
      text: 'About 0.9 million of GLADE’s 2.1 million galaxies have redshifts estimated from colour, not spectra',
      href: 'https://arxiv.org/abs/1804.05709',
    },
    {
      text: 'Planet and moon positions: fits to JPL Horizons, within 1,000 km from 1900 to 2100',
      href: 'https://ssd.jpl.nasa.gov/horizons/',
    },
    {
      text: 'The cosmic web glow: computed from SDSS galaxy positions',
      href: 'https://arxiv.org/abs/2204.01256',
    },
    {
      text: 'Filaments between galaxies: traced by an algorithm, not observed',
      href: 'https://arxiv.org/abs/1009.4015',
    },
  ],
  drawn: [
    {
      text: 'The Milky Way from outside, disc and bar: a model fitted to infrared survey data',
      href: 'https://arxiv.org/abs/astro-ph/9707340',
    },
    {
      text: 'The Milky Way’s spiral arms: placed from maser parallaxes, then drawn',
      href: 'https://arxiv.org/abs/1910.03357',
    },
    {
      text: 'The edge of the observable universe: a sphere computed from a cosmological model',
      href: 'https://arxiv.org/abs/1807.06209',
    },
    {
      text: 'Atmospheres: a scattering model, not a photograph',
      href: 'https://github.com/ebruneton/precomputed_atmospheric_scattering',
    },
    {
      text: 'Earth’s clouds: a fixed composite, not today’s weather',
      href: 'https://visibleearth.nasa.gov/',
    },
    {
      text: 'Black holes: a lensing model with an invented glowing disc, not an image',
      href: 'https://arxiv.org/abs/2010.08735',
    },
    {
      text: 'Structure markers such as Laniakea: spheres placed by hand at an approximate centre',
      href: `${REPO_BLOB}/data/seeds/structure_anchors.seed.json`,
    },
  ],
};
