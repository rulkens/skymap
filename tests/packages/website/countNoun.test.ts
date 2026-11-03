import { describe, expect, it } from 'vitest';

import { countNoun } from '../../../packages/website/src/utils/countNoun';

describe('countNoun', () => {
  it.each([
    ['a size that names its kind', 'gaia', '44,599 galaxies', 'galaxies and quasars', 'galaxies'],
    [
      'a generic size, a source with its own word',
      'sdss',
      '1,234,567 spectra',
      'galaxies and quasars',
      'galaxies',
    ],
    [
      'a generic size, no word of its own',
      'glade',
      '3,262,881 rows',
      'galaxies and quasars',
      'galaxies and quasars',
    ],
    ['no size at all', 'milliquas', undefined, 'galaxies and quasars', 'quasars'],
  ])('%s', (_, id, rows, group, expected) => {
    expect(countNoun(id, rows, group)).toBe(expected);
  });
});
