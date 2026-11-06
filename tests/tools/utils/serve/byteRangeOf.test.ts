import { describe, expect, it } from 'vitest';
import { byteRangeOf } from '../../../../tools/utils/serve/byteRangeOf';

describe('byteRangeOf', () => {
  it.each([
    ['bytes=0-99', 1000, { start: 0, end: 99 }],
    ['bytes=990-', 1000, { start: 990, end: 999 }],
    ['bytes=-10', 1000, { start: 990, end: 999 }],
    ['bytes=900-2000', 1000, { start: 900, end: 999 }],
    ['bytes=1000-', 1000, 'unsatisfiable'],
    ['bytes=-10', 0, 'unsatisfiable'],
    ['bytes=0-1,5-9', 1000, null],
    ['items=0-1', 1000, null],
    [undefined, 1000, null],
  ])('%s of %i', (header, size, want) => expect(byteRangeOf(header, size)).toEqual(want));
});
