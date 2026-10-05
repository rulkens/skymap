import type { HonestyItem } from '../@types/HonestyItem';

type Honesty = { measured: readonly HonestyItem[]; drawn: readonly HonestyItem[] };

/**
 * "What is measured, what is drawn" on Home. Each line follows docs/science.md
 * ("Measured, derived, or modelled") and ATTRIBUTIONS.md; `href` is the survey
 * or method paper behind it. Filaments and the cosmic web glow are derived by
 * published algorithms from measured positions, which is why they are drawn.
 */
export const HONESTY: Honesty = {
  measured: [
    {
      text: 'Star positions and distances, from Gaia',
      href: 'https://arxiv.org/abs/2012.05220',
    },
    {
      text: 'Galaxy positions and redshifts, from SDSS, 2MRS and GLADE',
      href: 'https://www.sdss4.org/dr17/scope/',
    },
    {
      text: 'Planet and moon orbits, from JPL’s published elements',
      href: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    },
    {
      text: 'Earth’s surface, from satellite and aerial photography',
      href: 'https://cloudless.eox.at',
    },
  ],
  drawn: [
    {
      text: 'The Milky Way from outside: a model, since nobody has photographed it',
      href: 'https://arxiv.org/abs/astro-ph/9707340',
    },
    {
      text: 'The cosmic web glow: computed from galaxy positions',
      href: 'https://arxiv.org/abs/2204.01256',
    },
    {
      text: 'Filaments between galaxies: traced by an algorithm, not observed',
      href: 'https://arxiv.org/abs/1009.4015',
    },
    {
      text: 'Atmospheres: a scattering model, not a photograph',
      href: 'https://github.com/ebruneton/precomputed_atmospheric_scattering',
    },
  ],
};
