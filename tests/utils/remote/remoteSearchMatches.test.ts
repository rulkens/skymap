import { describe, expect, it } from 'vitest';

import { remoteSearchMatches } from '../../../src/utils/remote/remoteSearchMatches';
import { actionForRow } from '../../../src/utils/palette/actionForRow';
import { rankPaletteMatches } from '../../../src/utils/palette/rankPaletteMatches';
import type { RemoteSearchInputs } from '../../../src/@types/remote/RemoteSearchInputs';

const inputs: RemoteSearchInputs = {
  entries: Array.from({ length: 15 }, (_, i) => ({
    id: `zork-${i}`,
    names: [`Zork ${i}`],
    description: '',
    type: '',
  })),
  aliasIndex: [],
  structures: [],
  layerRows: [],
};

describe('remoteSearchMatches', () => {
  it('caps at ten', () => {
    expect(remoteSearchMatches(inputs, 'zork')).toHaveLength(10);
  });

  it('an empty or whitespace query gives no matches', () => {
    expect(remoteSearchMatches(inputs, '')).toEqual([]);
    expect(remoteSearchMatches(inputs, '   ')).toEqual([]);
  });

  it("each match carries actionForRow's action", () => {
    const rows = rankPaletteMatches(inputs.entries, [], [], [], 'zork 1');
    const matches = remoteSearchMatches(inputs, 'zork 1');
    expect(matches.map((m) => m.action)).toEqual(rows.slice(0, 10).map(actionForRow));
    expect(matches[0]).toMatchObject({ name: 'Zork 1', kind: 'Galaxy' });
  });
});
