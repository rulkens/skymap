import type { DocsSettingSize } from '../@types/DocsSettingSize';

const SAME = 'The same';

/**
 * What each of the app's three data sizes holds, for the Settings page. The
 * counts are the ones the app's Settings panel printed beside each catalogue
 * on the check date of the `ref-settings-sizes` row, read at each size in
 * turn; the Milky Way's are the app's MILKY_WAY_STARS_PER_TIER, which
 * tests/packages/website/docsReference.test.ts compares.
 */
export const DOCS_SETTING_SIZES: readonly DocsSettingSize[] = [
  { what: 'SDSS galaxies', small: 'None', medium: '159,899', large: '502,114' },
  { what: 'GLADE galaxies', small: '267,080', medium: '409,522', large: '1,665,935' },
  { what: 'Milliquas quasars', small: '60,000', medium: '200,000', large: '943,440' },
  { what: 'Gaia stars', small: '1,697,603', medium: '5,117,467', large: '12,853,984' },
  { what: 'Points that draw the Milky Way', small: '37,500', medium: '75,000', large: '150,000' },
  {
    what: 'The cosmic web density grids',
    small: 'The coarsest',
    medium: 'The middle one',
    large: 'The finest',
  },
  { what: '2MRS galaxies', small: '34,974', medium: SAME, large: SAME },
  {
    what: 'Named galaxies and stars, structures, the DESI regions, the filaments, the flow field and everything in the solar system',
    small: 'All of them',
    medium: SAME,
    large: SAME,
  },
];
