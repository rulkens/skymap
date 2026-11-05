import { describe, it, expect } from 'vitest';
import { cardShotUrl } from '../../../src/utils/palette/cardShotUrl';
import { CARD_IMAGE_DIR } from '../../../src/data/palette/cardImageDir';

describe('cardShotUrl', () => {
  it('builds the featured-shot path for a focus id', () => {
    expect(CARD_IMAGE_DIR).toBe('/images/featured');
    expect(cardShotUrl('body-mars')).toBe('/images/featured/body-mars.webp');
  });
});
