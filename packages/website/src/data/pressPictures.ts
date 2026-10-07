import type { PressPicture } from '../@types/PressPicture';

/**
 * The pictures the About page shows with their terms, and what each contains.
 * Terms come from ATTRIBUTIONS.md as checked on 2026-10-07. A picture carries
 * the most restrictive term among its ingredients, and every one here holds a
 * source that states no licence, so none is offered for unrestricted reuse.
 * Not here at all: Earth close up (EOX imagery) and galaxy photographs.
 */
export const PRESS_PICTURES: readonly PressPicture[] = [
  {
    shot: 'science-wedges',
    title: 'Every catalogued galaxy and quasar',
    credit: 'skymap / Alexander Rulkens. Data: SDSS, 2MRS, GLADE, DESI, Milliquas, Cosmicflows-4, HyperLEDA',
    terms:
      'Contains catalogue positions only. DESI is CC BY 4.0 and SDSS calls its data public domain. GLADE, Milliquas and HyperLEDA state no licence. 2MRS and Cosmicflows-4 state none either, and CDS, which serves the copies we use, classes both as CC BY-NC (non-commercial).',
  },
  {
    shot: 'tour-cosmic-web',
    title: 'The cosmic web around us',
    credit:
      'skymap / Alexander Rulkens. Density map: Wilde et al. 2023, from SDSS. Superclusters: MSCC, Chow-Martínez et al. 2014',
    terms:
      'Contains a density map from an SDSS data release, which SDSS calls public domain, and discs placed from a supercluster catalogue (MSCC) that states no licence.',
  },
  {
    shot: 'saturn',
    title: 'Saturn, rings open',
    credit: 'skymap / Alexander Rulkens. Saturn: Solar System Scope (CC BY 4.0). Stars: ESA/Gaia/DPAC, Hipparcos',
    terms:
      'The planet’s map is CC BY 4.0. The stars behind it are Gaia data, CC BY-NC 3.0 IGO (non-commercial; ESA asks for a request before any commercial use), and the brightest are from the Hipparcos catalogue, which states no licence.',
  },
  {
    shot: 'earth-terminator',
    title: 'Earth, day into night',
    credit: 'skymap / Alexander Rulkens. Earth: NASA Earth Observatory, Blue Marble. Stars: ESA/Gaia/DPAC, Hipparcos',
    terms:
      'The surface is NASA imagery, which NASA says is generally not subject to copyright in the United States and may be used editorially in works that are not promotional. The stars behind it are Gaia data, CC BY-NC 3.0 IGO (non-commercial; ESA asks for a request before any commercial use), and the brightest are from the Hipparcos catalogue, which states no licence.',
  },
];
