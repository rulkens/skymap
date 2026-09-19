import { describe, expect, it } from 'vitest';
import { concatUniqueRows } from '../../../src/utils/object/concatUniqueRows';

type Row = { readonly name: string };
const byName = (row: Row): string => row.name;

describe('concatUniqueRows', () => {
  // Passes resolve a FRAME_ORDER name to the FIRST match, so a reordering bug
  // would change which pass draws.
  it('returns every row, lists in order then rows in order', () => {
    const rows = concatUniqueRows('t', byName, [
      [{ name: 'a' }, { name: 'b' }],
      [],
      [{ name: 'c' }],
    ]);
    expect(rows.map(byName)).toEqual(['a', 'b', 'c']);
  });

  it('throws naming the table and the key on a duplicate across lists', () => {
    expect(() => concatUniqueRows('t', byName, [[{ name: 'k' }], [{ name: 'k' }]])).toThrow(
      "t: two rows share the key 'k'",
    );
  });

  it('throws on a duplicate within one list', () => {
    expect(() => concatUniqueRows('t', byName, [[{ name: 'k' }, { name: 'k' }]])).toThrow(/'k'/);
  });
});
