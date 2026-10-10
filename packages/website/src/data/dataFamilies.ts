import type { DataFamily } from '../@types/DataFamily';

/**
 * The families of the data pages, in the order the index lists them. The
 * licence record is sorted by kind of thing (`sections`), which is nearly
 * this order; the catalogues are one section there and four families here, so
 * those entries are moved by id. An entry of a section no family names gets a
 * family of that section's name, with a page of its own, so a new part of the
 * record still shows up without an edit here. The small things (code, fonts,
 * services, tools, our own files) share one page a family: a page of their
 * own would be eight short lines each.
 */
export const DATA_FAMILIES: readonly DataFamily[] = [
  {
    id: 'stars',
    name: 'Star catalogues',
    about: 'Where each star stands, how bright it is and what colour, with the orbits at the centre of the Milky Way.',
    pages: 'each',
    sections: [],
    ids: [
      'gaia',
      'bailer-jones',
      'gcns',
      'hipparcos',
      'd3-celestial',
      'seed-famous-stars',
      's-stars',
      's301',
      'gravity-r0',
      'pecaut-mamajek',
    ],
    step: 'stars',
  },
  {
    id: 'galaxies',
    name: 'Galaxy catalogues',
    about: 'The surveys behind every galaxy and quasar point, and the tables that give them distances and tilt.',
    pages: 'each',
    sections: ['Catalogue data'],
    ids: ['seed-famous-galaxies', 'seed-local-volume'],
    step: 'parse',
  },
  {
    id: 'structures',
    name: 'Structure catalogues and fields',
    about: 'Clusters and superclusters, the density and flow fields of the cosmic web, and the dust and gas near the Sun.',
    pages: 'each',
    sections: ['Fields, volumes and structures'],
    ids: ['mcxc', 'mscc', 'seed-structures'],
    step: 'structures-fields-and-filaments',
  },
  {
    id: 'solar-system',
    name: 'Solar System ephemerides and facts',
    about: 'The orbits of the planets and moons, the positions they are corrected to, and the figures on each body’s card.',
    pages: 'each',
    sections: [],
    ids: ['jpl-elements', 'horizons', 'seed-planet-facts'],
    step: 'planets-moons-and-their-positions',
  },
  {
    id: 'imagery',
    name: 'Imagery and textures',
    about: 'The photographs and mosaics on galaxies, planets, moons and Earth.',
    pages: 'each',
    sections: ['Galaxy imagery', 'Solar-system textures', 'Earth imagery and terrain'],
    ids: ['viking'],
    step: 'imagery-and-terrain',
  },
  {
    id: 'terrain',
    name: 'Terrain and heights',
    about: 'Height data for Earth, Mars and the moons: what lifts the ground and shades the relief.',
    pages: 'each',
    sections: ['Mars surface'],
    ids: ['etopo', 'skadi', 'dhm', 'svs-moon-kit', 'gaskell', 'schenk-enceladus-dem', 'schenk-triton-dem'],
    step: 'imagery-and-terrain',
  },
  {
    id: 'models',
    name: '3D models',
    about: 'The spacecraft, the rovers, a whale, a bowl of petunias and one park in Copenhagen.',
    pages: 'each',
    sections: ['3D models'],
    ids: ['skraafoto'],
    step: '3d-models',
  },
  {
    id: 'services',
    name: 'Services and links',
    about:
      'What the app or its build asks of other sites: catalogue queries, galaxy pictures fetched as you fly, the visit counter and plain links.',
    pages: 'one',
    sections: ['Services and links'],
    ids: ['vizier', 'sdss-images', 'dss', 'legacy-surveys'],
  },
  {
    id: 'fonts',
    name: 'Fonts',
    about: 'The three typefaces of the app and this website.',
    pages: 'one',
    sections: ['Fonts'],
    ids: [],
  },
  {
    id: 'code',
    name: 'Code and algorithms',
    about: 'Functions ported from other people’s code, the papers our shaders follow, and the libraries in the bundle.',
    pages: 'one',
    sections: ['Code and methods'],
    ids: ['npm-dependencies'],
  },
  {
    id: 'tools',
    name: 'Tools used in the pipeline',
    about: 'Programs we run when we build the data and do not ship: what they did to the files, and their terms.',
    pages: 'one',
    sections: [],
    ids: ['starnet', 'disperse', 'pyslime'],
  },
  {
    id: 'own',
    name: 'Our own files and pictures',
    about: 'What is ours in the data folder and on our hosts, and the terms that follow a picture made with skymap.',
    pages: 'one',
    sections: ['Hand-typed data'],
    ids: [],
  },
];
