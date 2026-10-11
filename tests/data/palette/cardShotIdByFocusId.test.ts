import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CARD_SHOT_ID_BY_FOCUS_ID } from '../../../src/data/palette/cardShotIdByFocusId';

describe('CARD_SHOT_ID_BY_FOCUS_ID', () => {
  it("maps a renamed card's focus id to the id its shot is stored under", () => {
    expect(CARD_SHOT_ID_BY_FOCUS_ID.get('galaxy-cluster-virgo-m87')).toBe('cluster-virgo-m87');
  });

  it('every mapped card id has a captured shot on disk', () => {
    const missing = [...CARD_SHOT_ID_BY_FOCUS_ID.values()].filter(
      (id) => !existsSync(`public/images/featured/${id}.webp`),
    );
    expect(missing).toEqual([]);
  });
});
