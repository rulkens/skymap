import { describe, expect, it } from 'vitest';

import { remoteSearchMatches } from '../../../src/utils/remote/remoteSearchMatches';
import { actionForRow } from '../../../src/utils/palette/actionForRow';
import { rankPaletteMatches } from '../../../src/utils/palette/rankPaletteMatches';

const entries = Array.from({ length: 15 }, (_, i) => ({
  id: `zork-${i}`,
  names: [`Zork ${i}`],
  description: '',
  type: '',
}));

describe('remoteSearchMatches', () => {
  it('caps at ten', () => {
    expect(remoteSearchMatches(rankPaletteMatches(entries, [], [], [], 'zork'))).toHaveLength(10);
  });

  it("each match carries actionForRow's action", () => {
    const rows = rankPaletteMatches(entries, [], [], [], 'zork 1');
    const matches = remoteSearchMatches(rows);
    expect(matches.map((m) => m.action)).toEqual(rows.slice(0, 10).map(actionForRow));
    expect(matches[0]).toMatchObject({ name: 'Zork 1', kind: 'Galaxy' });
  });
});
