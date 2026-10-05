import { describe, it, expect } from 'vitest';
import { cardAliases } from '../../../../src/components/CommandPalette/utils/cardAliases';
import type { PaletteCard } from '../../../../src/@types/palette/PaletteCard';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';

const M31: FamousGalaxyMetaEntry = {
  id: 'm31',
  names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
  description: '',
  type: 'Sb',
};

describe('cardAliases', () => {
  it("a famous focus card lists the entry's other names", () => {
    const card: PaletteCard = {
      id: 'm31',
      label: 'Andromeda Galaxy',
      blurb: 'TODO',
      action: { kind: 'focus', focusId: 'm31' },
    };
    expect(cardAliases(card, [M31])).toEqual(['M31', 'NGC 224']);
  });

  it('a non-famous focus card has no aliases', () => {
    const card: PaletteCard = {
      id: 'body-earth',
      label: 'Earth',
      blurb: 'TODO',
      action: { kind: 'focus', focusId: 'body-earth' },
    };
    expect(cardAliases(card, [M31])).toEqual([]);
  });
});
