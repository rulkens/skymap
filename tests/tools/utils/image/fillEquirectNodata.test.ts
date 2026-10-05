import { describe, expect, it } from 'vitest';

import { fillEquirectNodata } from '../../../../tools/utils/image/fillEquirectNodata';

describe('fillEquirectNodata', () => {
  it('fills a multi-cell hole from its surroundings, leaving valid cells untouched', () => {
    const g = new Float32Array(5 * 3).fill(7);
    g[6] = g[7] = g[8] = NaN;
    fillEquirectNodata(g, 5, 3);
    expect([...g]).toEqual(new Array(15).fill(7));
  });

  it('wraps across the antimeridian but clamps at the poles', () => {
    const g = Float32Array.from([NaN, 1, 1, 9, /* row 1 */ 5, 5, 5, 5]);
    fillEquirectNodata(g, 4, 2);
    expect(g[0]).toBeCloseTo((1 + 9 + 5) / 3); // east, wrapped west, south; no north neighbour
  });

  it('matches the whole-grid ring-by-ring fill bit for bit', () => {
    const w = 23;
    const h = 11;
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const g = Float32Array.from({ length: w * h }, () => (rand() < 0.08 ? rand() * 100 : NaN));

    const ref = g.slice();
    for (let again = true; again; ) {
      again = false;
      const next = ref.slice();
      for (let i = 0; i < ref.length; i++) {
        if (!Number.isNaN(ref[i]!)) continue;
        const x = i % w;
        const y = (i - x) / w;
        let acc = 0;
        let n = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (y + dy < 0 || y + dy >= h) continue;
          const v = ref[(y + dy) * w + ((x + dx + w) % w)]!;
          if (!Number.isNaN(v)) ((acc += v), n++);
        }
        if (n > 0) ((next[i] = acc / n), (again = true));
      }
      ref.set(next);
    }

    fillEquirectNodata(g, w, h);
    expect(Array.from(g)).toEqual(Array.from(ref));
  });
});
