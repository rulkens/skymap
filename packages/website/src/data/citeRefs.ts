import type { CiteRef } from '../@types/CiteRef';

const CHECKED = '2026-10-07';
const AA = 'Astronomy & Astrophysics';
const AJ = 'The Astronomical Journal';
const APJ = 'The Astrophysical Journal';
const APJS = 'The Astrophysical Journal Supplement Series';
const MNRAS = 'Monthly Notices of the Royal Astronomical Society';

const BURCHETT_2020: CiteRef = {
  authors: 'Burchett, J. N., Elek, O., Tejos, N., et al.',
  year: 2020,
  title: 'Revealing the Dark Threads of the Cosmic Web',
  journal: 'The Astrophysical Journal Letters 891, L35',
  doi: '10.3847/2041-8213/ab700c',
  arxiv: '2003.04393',
  checked: CHECKED,
};

const ELEK_2021: CiteRef = {
  authors: 'Elek, O., Burchett, J. N., Prochaska, J. X., & Forbes, A. G.',
  year: 2021,
  title:
    'Polyphorm: Structural Analysis of Cosmological Datasets via Interactive Physarum Polycephalum Visualization',
  journal: 'IEEE Transactions on Visualization and Computer Graphics 27, 806',
  doi: '10.1109/TVCG.2020.3030407',
  arxiv: '2009.02441',
  checked: CHECKED,
};

/**
 * The papers to cite for the catalogues and fields a statement made with
 * skymap can rest on, keyed by entry id of ATTRIBUTIONS.md, whose entries name
 * each paper only as "Huchra et al. 2012". Authors, year, title, journal,
 * volume and page are as the DOI's record at doi.org gave them on the check
 * date (three authors, then "et al."); a title printed there in capitals is
 * given as its arXiv record has it. tests/packages/website/citeRefs.test.ts
 * holds each row to the entry that names it.
 */
export const CITE_REFS: Readonly<Record<string, readonly CiteRef[]>> = {
  sdss: [
    {
      authors: 'Abdurro’uf, Accetta, K., Aerts, C., et al.',
      year: 2022,
      title:
        'The Seventeenth Data Release of the Sloan Digital Sky Surveys: Complete Release of MaNGA, MaStar, and APOGEE-2 Data',
      journal: `${APJS} 259, 35`,
      doi: '10.3847/1538-4365/ac4414',
      checked: CHECKED,
    },
  ],
  '2mrs': [
    {
      authors: 'Huchra, J. P., Macri, L. M., Masters, K. L., et al.',
      year: 2012,
      title: 'The 2MASS Redshift Survey - Description and Data Release',
      journal: `${APJS} 199, 26`,
      doi: '10.1088/0067-0049/199/2/26',
      arxiv: '1108.0669',
      checked: CHECKED,
    },
  ],
  '2mass-xsc': [
    {
      authors: 'Jarrett, T. H., Chester, T., Cutri, R., et al.',
      year: 2000,
      title: '2MASS Extended Source Catalog: Overview and Algorithms',
      journal: `${AJ} 119, 2498`,
      doi: '10.1086/301330',
      checked: CHECKED,
    },
  ],
  glade: [
    {
      authors: 'Dálya, G., Galgóczi, G., Dobos, L., et al.',
      year: 2018,
      title:
        'GLADE: A galaxy catalogue for multimessenger searches in the advanced gravitational-wave detector era',
      journal: `${MNRAS} 479, 2374`,
      doi: '10.1093/mnras/sty1703',
      arxiv: '1804.05709',
      checked: CHECKED,
    },
  ],
  hyperleda: [
    {
      authors: 'Makarov, D., Prugniel, P., Terekhova, N., et al.',
      year: 2014,
      title: 'HyperLEDA. III. The catalogue of extragalactic distances',
      journal: `${AA} 570, A13`,
      doi: '10.1051/0004-6361/201423496',
      checked: CHECKED,
    },
    {
      authors: 'Paturel, G., Petit, C., Prugniel, Ph., et al.',
      year: 2003,
      title: 'HYPERLEDA. I. Identification and designation of galaxies',
      journal: `${AA} 412, 45`,
      doi: '10.1051/0004-6361:20031411',
      checked: CHECKED,
    },
  ],
  milliquas: [
    {
      authors: 'Flesch, E. W.',
      year: 2023,
      title: 'The Million Quasars (Milliquas) Catalogue, v8',
      journal: 'The Open Journal of Astrophysics 6, 49',
      doi: '10.21105/astro.2308.01505',
      arxiv: '2308.01505',
      checked: CHECKED,
    },
  ],
  desi: [
    {
      authors: 'DESI Collaboration, Abdul Karim, M., Adame, A. G., et al.',
      year: 2026,
      title: 'Data Release 1 of the Dark Energy Spectroscopic Instrument',
      journal: `${AJ} 171, 285`,
      doi: '10.3847/1538-3881/ae4c43',
      arxiv: '2503.14745',
      checked: CHECKED,
    },
  ],
  'cf4-distances': [
    {
      authors: 'Tully, R. B., Kourkchi, E., Courtois, H. M., et al.',
      year: 2023,
      title: 'Cosmicflows-4',
      journal: `${APJ} 944, 94`,
      doi: '10.3847/1538-4357/ac94d8',
      arxiv: '2209.11238',
      checked: CHECKED,
    },
  ],
  gaia: [
    {
      authors: 'Gaia Collaboration, Vallenari, A., Brown, A. G. A., et al.',
      year: 2023,
      title: 'Gaia Data Release 3. Summary of the content and survey properties',
      journal: `${AA} 674, A1`,
      doi: '10.1051/0004-6361/202243940',
      checked: CHECKED,
    },
  ],
  'bailer-jones': [
    {
      authors: 'Bailer-Jones, C. A. L., Rybizki, J., Fouesneau, M., et al.',
      year: 2021,
      title:
        'Estimating Distances from Parallaxes. V. Geometric and Photogeometric Distances to 1.47 Billion Stars in Gaia Early Data Release 3',
      journal: `${AJ} 161, 147`,
      doi: '10.3847/1538-3881/abd806',
      checked: CHECKED,
    },
  ],
  gcns: [
    {
      authors: 'Gaia Collaboration, Smart, R. L., Sarro, L. M., et al.',
      year: 2021,
      title: 'Gaia Early Data Release 3. The Gaia Catalogue of Nearby Stars',
      journal: `${AA} 649, A6`,
      doi: '10.1051/0004-6361/202039498',
      checked: CHECKED,
    },
  ],
  hipparcos: [
    {
      authors: 'van Leeuwen, F.',
      year: 2007,
      title: 'Validation of the new Hipparcos reduction',
      journal: `${AA} 474, 653`,
      doi: '10.1051/0004-6361:20078357',
      checked: CHECKED,
    },
  ],
  's-stars': [
    {
      authors: 'Gillessen, S., Plewa, P. M., Eisenhauer, F., et al.',
      year: 2017,
      title: 'An Update on Monitoring Stellar Orbits in the Galactic Center',
      journal: `${APJ} 837, 30`,
      doi: '10.3847/1538-4357/aa5c41',
      checked: CHECKED,
    },
  ],
  s301: [
    {
      authors: 'Abd El Dayem, K., Abuter, R., Aimar, N., et al.',
      year: 2026,
      title: 'Discovery of a star sensitive to the spin of Sagittarius A*',
      journal: 'Nature 657, 359',
      doi: '10.1038/s41586-026-10894-w',
      arxiv: '2607.12664',
      checked: CHECKED,
    },
  ],
  'gravity-r0': [
    {
      authors: 'GRAVITY Collaboration, Abuter, R., Amorim, A., et al.',
      year: 2019,
      title: 'A geometric distance measurement to the Galactic center black hole with 0.3% uncertainty',
      journal: `${AA} 625, L10`,
      doi: '10.1051/0004-6361/201935656',
      checked: CHECKED,
    },
  ],
  'pecaut-mamajek': [
    {
      authors: 'Pecaut, M. J., & Mamajek, E. E.',
      year: 2013,
      title: 'Intrinsic Colors, Temperatures, and Bolometric Corrections of Pre-main-sequence Stars',
      journal: `${APJS} 208, 9`,
      doi: '10.1088/0067-0049/208/1/9',
      checked: CHECKED,
    },
  ],
  mcxc: [
    {
      authors: 'Piffaretti, R., Arnaud, M., Pratt, G. W., et al.',
      year: 2011,
      title: 'The MCXC: a meta-catalogue of x-ray detected clusters of galaxies',
      journal: `${AA} 534, A109`,
      doi: '10.1051/0004-6361/201015377',
      checked: CHECKED,
    },
  ],
  mscc: [
    {
      authors: 'Chow-Martínez, M., Andernach, H., Caretta, C. A., et al.',
      year: 2014,
      title: 'Two new catalogues of superclusters of Abell/ACO galaxy clusters out to redshift 0.15',
      journal: `${MNRAS} 445, 4073`,
      doi: '10.1093/mnras/stu1961',
      checked: CHECKED,
    },
  ],
  vizier: [
    {
      authors: 'Ochsenbein, F., Bauer, P., & Marcout, J.',
      year: 2000,
      title: 'The VizieR database of astronomical catalogues',
      journal: 'Astronomy and Astrophysics Supplement Series 143, 23',
      doi: '10.1051/aas:2000169',
      checked: CHECKED,
    },
  ],
  cf4pp: [
    {
      authors: 'Courtois, H. M., Mould, J., Hollinger, A. M., et al.',
      year: 2025,
      title: 'In search of the Local Universe dynamical homogeneity scale with CF4++ peculiar velocities',
      journal: `${AA} 701, A187`,
      doi: '10.1051/0004-6361/202553677',
      arxiv: '2502.01308',
      checked: CHECKED,
    },
  ],
  'mcpm-vac': [
    {
      authors: 'Wilde, M. C., Elek, O., Burchett, J. N., et al.',
      year: 2023,
      title: 'SDSS DR17: The Cosmic Slime Value Added Catalog',
      journal: 'arXiv preprint',
      arxiv: '2301.02719',
      checked: CHECKED,
    },
    BURCHETT_2020,
    ELEK_2021,
  ],
  polyphorm: [ELEK_2021, BURCHETT_2020],
  edenhofer: [
    {
      authors: 'Edenhofer, G., Zucker, C., Frank, P., et al.',
      year: 2024,
      title: 'A parsec-scale Galactic 3D dust map out to 1.25 kpc from the Sun',
      journal: `${AA} 685, A82`,
      doi: '10.1051/0004-6361/202347628',
      checked: CHECKED,
    },
    {
      authors: 'Edenhofer, G., Zucker, C., Frank, P., et al.',
      year: 2023,
      title:
        'A Parsec-Scale Galactic 3D Dust Map out to 1.25 kpc from the Sun -- Dataset for the 1.25 kpc 3D Dust Map and the 2 kpc 3D Dust Map',
      journal: 'Zenodo, version 1.0',
      doi: '10.5281/zenodo.8187943',
      checked: CHECKED,
    },
  ],
  'local-bubble': [
    {
      authors: 'O’Neill, T. J., Zucker, C., Goodman, A. A., & Edenhofer, G.',
      year: 2024,
      title: 'The Local Bubble Is a Local Chimney: A New Model from 3D Dust Mapping',
      journal: `${APJ} 973, 136`,
      doi: '10.3847/1538-4357/ad61de',
      arxiv: '2403.04961',
      checked: CHECKED,
    },
  ],
  disperse: [
    {
      authors: 'Sousbie, T.',
      year: 2011,
      title: 'The persistent cosmic web and its filamentary structure - I. Theory and implementation',
      journal: `${MNRAS} 414, 350`,
      doi: '10.1111/j.1365-2966.2011.18394.x',
      checked: CHECKED,
    },
  ],
};
