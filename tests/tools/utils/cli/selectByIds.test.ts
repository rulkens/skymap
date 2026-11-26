import { describe, expect, it } from 'vitest';

import { selectByIds } from '../../../../tools/utils/cli/selectByIds';

const ROWS = [{ id: 'voyager1' }, { id: 'voyager2' }, { id: '2026-qq8' }];

describe('selectByIds', () => {
  it('keeps every row when no id is given', () => {
    expect(selectByIds(ROWS, [])).toEqual(ROWS);
  });

  it('keeps only the named rows, in table order', () => {
    expect(selectByIds(ROWS, ['2026-qq8', 'voyager1'])).toEqual([
      { id: 'voyager1' },
      { id: '2026-qq8' },
    ]);
  });

  it('rejects an unknown id and lists the valid ones', () => {
    expect(() => selectByIds(ROWS, ['2026-qq8', 'voyager3'])).toThrow(
      'unknown id "voyager3"; valid ids: voyager1, voyager2, 2026-qq8',
    );
  });
});
