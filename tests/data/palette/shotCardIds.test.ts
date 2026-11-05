import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { SHOT_CARD_IDS } from '../../../src/data/palette/shotCardIds';
import { cardShotUrl } from '../../../src/utils/palette/cardShotUrl';

describe('SHOT_CARD_IDS', () => {
  it('every id has a captured shot on disk under its own focus id', () => {
    const missing = [...SHOT_CARD_IDS].filter((id) => !existsSync(`public${cardShotUrl(id)}`));
    expect(missing).toEqual([]);
  });
});
