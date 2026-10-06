import type { PressPicture } from '../@types/PressPicture';

/**
 * The pictures the About page offers for reuse, with what each one contains.
 * Terms come from ATTRIBUTIONS.md and the data table (data/dataSources.ts).
 * Only pictures whose every ingredient we can name are here: none shows Earth
 * close up (EOX imagery, non-commercial) or a galaxy photograph (mixed terms).
 */
export const PRESS_PICTURES: readonly PressPicture[] = [
  {
    shot: 'science-wedges',
    title: 'Every catalogued galaxy and quasar',
    credit: 'skymap / Alexander Rulkens. Data: SDSS, 2MRS, GLADE, DESI, Milliquas',
    terms:
      'Contains catalogue positions only. DESI is CC BY 4.0; the others are public releases that ask to be cited (GLADE’s page states no licence), so the credit line is the condition.',
    nonCommercial: false,
  },
  {
    shot: 'tour-cosmic-web',
    title: 'The cosmic web around us',
    credit: 'skymap / Alexander Rulkens. Density map: Wilde et al. 2023, from SDSS. Superclusters: MSCC',
    terms:
      'Contains a density map and a supercluster catalogue, both public releases that ask to be cited, so the credit line is the condition.',
    nonCommercial: false,
  },
  {
    shot: 'saturn',
    title: 'Saturn, rings open',
    credit: 'skymap / Alexander Rulkens. Saturn: Solar System Scope (CC BY 4.0). Stars: ESA/Gaia/DPAC',
    terms:
      'The planet’s map is CC BY 4.0. The stars behind it are Gaia data, CC BY-NC 3.0 IGO, so this picture is for non-commercial use unless ESA agrees otherwise.',
    nonCommercial: true,
  },
  {
    shot: 'earth-terminator',
    title: 'Earth, day into night',
    credit: 'skymap / Alexander Rulkens. Earth: NASA Earth Observatory, Blue Marble. Stars: ESA/Gaia/DPAC',
    terms:
      'The surface is NASA imagery in the public domain. The stars behind it are Gaia data, CC BY-NC 3.0 IGO, so this picture is for non-commercial use unless ESA agrees otherwise.',
    nonCommercial: true,
  },
];
