import { describe, expect, it } from 'vitest';

import { seededPick } from '../../../../tools/utils/random/seededPick';
import { splitmix64Rng } from '../../../../tools/utils/random/splitmix64Rng';

describe('seededPick', () => {
  it('picks k distinct members of the pool, the same ones for one seed', () => {
    const pool = Array.from({ length: 50 }, (_, i) => i * 3);
    const picks = seededPick(pool, 20, splitmix64Rng(1n));
    expect(new Set(picks).size).toBe(20);
    for (const p of picks) expect(pool).toContain(p);
    expect(seededPick(pool, 20, splitmix64Rng(1n))).toEqual(picks);
  });

  it('caps at the pool size', () => {
    expect(seededPick([4, 5], 10, splitmix64Rng(1n)).length).toBe(2);
  });
});
