import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CARD_SHOT_ID_BY_FOCUS_ID } from '../../../src/data/palette/cardShotIdByFocusId';

describe('CARD_SHOT_ID_BY_FOCUS_ID', () => {
  it('leaves out structure cards, whose shots are keyed by focus id under their own dir', () => {
    expect(CARD_SHOT_ID_BY_FOCUS_ID.has('galaxy-cluster-virgo-m87')).toBe(false);
    expect(CARD_SHOT_ID_BY_FOCUS_ID.get('body-earth')).toBe('body-earth');
  });

  it('every mapped card id has a captured shot on disk', () => {
    const missing = [...CARD_SHOT_ID_BY_FOCUS_ID.values()].filter(
      (id) => !existsSync(`public/images/featured/${id}.webp`),
    );
    expect(missing).toEqual([]);
  });
});
