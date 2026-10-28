import { describe, it, expect } from 'vitest';
import { craftSearch } from '../../../../src/layers/missions/present/craftSearch';

describe('craftSearch chips', () => {
  it("a craft's chip is its kind, and the whale and petunias carry none", async () => {
    const chips = new Map<string, string | undefined>();
    for await (const rows of craftSearch()) for (const r of rows) chips.set(r.id, r.chip);
    expect(chips.get('body-curiosity')).toBe('Rover');
    expect(chips.get('body-voyager2')).toBe('Probe');
    expect(chips.get('body-hubble')).toBe('Space telescope');
    expect(chips.get('body-whale')).toBeUndefined();
    expect(chips.get('body-petunias')).toBeUndefined();
  });
});
