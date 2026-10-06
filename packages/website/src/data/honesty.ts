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
      text: 'Where each star is and how far it shifts through the year (its parallax), from Gaia',
      href: 'https://www.cosmos.esa.int/web/gaia/dr3',
    },
    {
      text: 'Where each galaxy is on the sky and how far its light is stretched (its redshift), from SDSS',
      href: 'https://www.sdss4.org/dr17/scope/',
    },
    {
      text: 'The same for nearer galaxies, from 2MRS',
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
      text: 'Galaxy distances: computed from redshift, with one assumed rate of expansion',
      href: `${REPO_BLOB}/src/utils/math/constants.ts`,
    },
    {
      text: 'The rate of expansion is known to about 4 per cent, so distant galaxies could be that much nearer or farther',
      href: 'https://arxiv.org/abs/1807.06209',
    },
    {
      text: 'Galaxies within about 100 million light-years: distances from Cosmicflows-4 or HyperLEDA instead',
      href: 'https://projets.ip2i.in2p3.fr/cosmicflows/',
    },
    {
      text: 'About 0.9 million of GLADE’s 2.1 million galaxies have redshifts estimated from colour',
      href: 'https://arxiv.org/abs/1804.05709',
    },
    {
      text: 'Planets, and 18 moons of the four giant planets: positions fitted to JPL Horizons, within 1,000 km from 1900 to 2100',
      href: 'https://ssd.jpl.nasa.gov/horizons/',
    },
    {
      text: 'The cosmic web glow: computed from SDSS galaxy positions',
      href: 'https://arxiv.org/abs/2204.01256',
    },
    {
      text: 'Filaments between galaxies: traced by an algorithm',
      href: 'https://arxiv.org/abs/1009.4015',
    },
  ],
  drawn: [
    {
      text: 'The Milky Way from outside: a generated model, with its disc size taken from infrared survey data',
      href: 'https://arxiv.org/abs/astro-ph/9707340',
    },
    {
      text: 'The Milky Way’s spiral arms: four arms shaped by hand',
      href: `${REPO_BLOB}/src/data/milkyWay/milkyWayGalaxyParams.ts`,
    },
    {
      text: 'The edge of the observable universe: a sphere placed where a cosmological model puts it',
      href: 'https://arxiv.org/abs/1807.06209',
    },
    {
      text: 'Atmospheres: a light-scattering model',
      href: 'https://github.com/ebruneton/precomputed_atmospheric_scattering',
    },
    {
      text: 'Earth’s clouds: a fixed composite, not today’s weather',
      href: 'https://visibleearth.nasa.gov/',
    },
    {
      text: 'Betelgeuse’s surface: a plain disc sized from its catalogued radius',
      href: `${REPO_BLOB}/data/seeds/famous_stars.seed.json`,
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
