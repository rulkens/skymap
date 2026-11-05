import type { PressPicture } from '../@types/PressPicture';
import { MAKER_NAME } from './siteIdentity';

/** The credit every picture made with Skymap opens with (ATTRIBUTIONS.md, "Pictures made with skymap"). */
export const PRESS_CREDIT = `Skymap / ${MAKER_NAME}`;

const STARS = 'Stars: ESA/Gaia/DPAC, Hipparcos';
const STAR_TERMS =
  'The stars behind it are Gaia data, CC BY-NC 3.0 IGO (non-commercial; ESA asks for a request before any commercial use), and the brightest are from the Hipparcos catalogue, which states no licence.';
const CATALOGUES = 'Data: SDSS, 2MRS, GLADE, DESI, Milliquas, Cosmicflows-4, HyperLEDA';
const CATALOGUE_TERMS =
  'DESI is CC BY 4.0 and SDSS calls its data public domain. 2MRS, GLADE, Milliquas, Cosmicflows-4 and HyperLEDA state no licence. For the three we take from CDS (2MRS, GLADE and Cosmicflows-4), CDS says its data are free to use in a scientific context and that commercial use follows rules that depend on where the data come from.';
const NASA_TERMS =
  'which NASA says is generally not subject to copyright in the United States and may be used editorially in works that are not promotional';

/**
 * The press kit's pictures, in the kit's order, and what each contains. Terms come from ATTRIBUTIONS.md as
 * checked on 2026-10-07; a picture carries the most restrictive term among its ingredients. Not here: Earth
 * close up (EOX imagery) and galaxy photographs, whose terms cannot be passed on in one line.
 */
export const PRESS_PICTURES: readonly PressPicture[] = [
  {
    shot: 'features-hero-glint',
    file: 'earth-sun-glint-caribbean',
    title: 'Earth, the Sun’s glint off the Caribbean',
    credit: `${PRESS_CREDIT}. Earth: NASA Earth Observatory, Blue Marble. ${STARS}`,
    terms: `The surface is NASA imagery, ${NASA_TERMS}. ${STAR_TERMS}`,
  },
  {
    shot: 'saturn',
    file: 'saturn-rings-open-2017',
    title: 'Saturn, rings open',
    credit: `${PRESS_CREDIT}. Saturn: Solar System Scope (CC BY 4.0). ${STARS}`,
    terms: `The planet’s map is CC BY 4.0. ${STAR_TERMS}`,
  },
  {
    shot: 'about-milky-way',
    file: 'milky-way-model-from-outside',
    title: 'The Milky Way from outside',
    credit: PRESS_CREDIT,
    terms:
      'A model drawn by Skymap. The stars and the catalogued galaxies are switched off, so no one else’s data or imagery is in the frame.',
  },
  {
    shot: 'tour-cosmic-web',
    file: 'cosmic-web-around-us',
    title: 'The cosmic web around us',
    credit: `${PRESS_CREDIT}. Density map: Wilde et al. 2023, from SDSS. Superclusters: MSCC, Chow-Martínez et al. 2014`,
    terms:
      'Contains a density map from an SDSS data release, which SDSS calls public domain, and discs placed from a supercluster catalogue (MSCC) that states no licence.',
  },
  {
    shot: 'science-wedges',
    file: 'every-catalogued-galaxy-and-quasar',
    title: 'Every catalogued galaxy and quasar',
    credit: `${PRESS_CREDIT}. ${CATALOGUES}`,
    terms: `Contains catalogue positions only. ${CATALOGUE_TERMS}`,
  },
  {
    shot: 'dome-saturn',
    file: 'dome-fisheye-saturn',
    title: 'A dome’s whole sky, with Saturn',
    credit: `${PRESS_CREDIT}. Saturn: Solar System Scope (CC BY 4.0). ${STARS}`,
    terms: `The planet’s map is CC BY 4.0. ${STAR_TERMS}`,
  },
  {
    shot: 'filaments-derived',
    file: 'cosmic-web-filaments',
    title: 'The filaments of the cosmic web',
    credit: `${PRESS_CREDIT}. Filaments: DisPerSE, Sousbie 2011. ${CATALOGUES}`,
    terms: `The filaments are traced by us with DisPerSE through the 2MRS and GLADE galaxies. ${CATALOGUE_TERMS}`,
  },
];
