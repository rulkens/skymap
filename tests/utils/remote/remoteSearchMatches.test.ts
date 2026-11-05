import { describe, expect, it } from 'vitest';

import { remoteSearchMatches } from '../../../src/utils/remote/remoteSearchMatches';
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
});
