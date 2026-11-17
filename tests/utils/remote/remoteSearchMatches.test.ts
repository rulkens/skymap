import { describe, expect, it } from 'vitest';

import { remoteSearchMatches } from '../../../src/utils/remote/remoteSearchMatches';
import { rankPaletteMatches } from '../../../src/utils/palette/rankPaletteMatches';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import type { PaletteSkyContext } from '../../../src/@types/palette/PaletteSkyContext';

const NO_SKY: PaletteSkyContext = { hereOpen: false, host: asSceneBodyId('earth') };

const entries = Array.from({ length: 15 }, (_, i) => ({
  id: `zork-${i}`,
  names: [`Zork ${i}`],
  description: '',
  type: '',
}));

describe('remoteSearchMatches', () => {
  it('caps at ten', () => {
    expect(
      remoteSearchMatches(rankPaletteMatches(entries, [], [], [], 'zork', NO_SKY)),
    ).toHaveLength(10);
  });
});
