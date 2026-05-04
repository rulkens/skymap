import { describe, it, expect } from 'vitest';
import { parseNDskl } from '../tools/parseNDskl';

const FIXTURE = `ANDSKEL
3
[BBOX]
0 0 0 100 100 100
[CRITICAL POINTS]
2
0 50.0 50.0 50.0 0 -1 0 0
1 60.0 60.0 60.0 0 -1 0 0
[FILAMENTS]
2
0 1 3
10.0 10.0 10.0
20.0 20.0 20.0
30.0 30.0 30.0
0 1 2
40.0 40.0 40.0
50.0 50.0 50.0
[CRITICAL POINTS DATA]
1
density
0
0
[FILAMENTS DATA]
1
field_value
0.9
0.8
0.7
0.6
0.5
`;

describe('parseNDskl', () => {
  it('parses two filaments with their sample positions', () => {
    const sk = parseNDskl(FIXTURE);
    expect(sk.strips).toHaveLength(2);
    expect(sk.strips[0]!.vertices).toEqual([
      [10, 10, 10],
      [20, 20, 20],
      [30, 30, 30],
    ]);
    expect(sk.strips[1]!.vertices).toEqual([
      [40, 40, 40],
      [50, 50, 50],
    ]);
  });

  it('attaches per-vertex density when [FILAMENTS DATA] is present', () => {
    const sk = parseNDskl(FIXTURE);
    expect(sk.strips[0]!.density).toEqual([0.9, 0.8, 0.7]);
    expect(sk.strips[1]!.density).toEqual([0.6, 0.5]);
  });

  it('falls back to NaN-filled density when [FILAMENTS DATA] is absent', () => {
    const fixtureNoData = FIXTURE.split('[FILAMENTS DATA]')[0]!;
    const sk = parseNDskl(fixtureNoData);
    expect(sk.strips[0]!.density.every((d) => Number.isNaN(d))).toBe(true);
  });

  it('throws on missing ANDSKEL magic', () => {
    expect(() => parseNDskl('not a skeleton file')).toThrow(/ANDSKEL/);
  });

  it('throws when [FILAMENTS] block declares a count but lines run out', () => {
    const truncated = `ANDSKEL
3
[FILAMENTS]
2
0 1 3
10 10 10
`;
    expect(() => parseNDskl(truncated)).toThrow(/incomplete/i);
  });
});
