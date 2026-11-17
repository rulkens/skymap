import { expect, it } from 'vitest';

import { streamMetallicity } from '../../../../tools/streams/utils/streamMetallicity';

it('a tabled stream gets its measured value and citation; any other name, prototype keys included, none', () => {
  expect(streamMetallicity('Pal5')).toEqual({ feh: -1.41, ref: 'Harris 1996, 2010 ed.' });
  expect(streamMetallicity('GD-1')).toBeNull();
  expect(streamMetallicity('constructor')).toBeNull();
});
