import { describe, it, expect } from 'vitest';
import { parseNDskl, skeletonToFilamentCloud } from '../../tools/parsers/ndskl';

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

  it('throws on a malformed sample line with fewer than 3 numbers', () => {
    const fixture = `ANDSKEL
3
[FILAMENTS]
1
0 1 2
10 10 10
20 20
`;
    expect(() => parseNDskl(fixture)).toThrow(/bad sample/i);
  });

  it('throws on a non-numeric filament count', () => {
    const fixture = `ANDSKEL
3
[FILAMENTS]
not-a-number
`;
    expect(() => parseNDskl(fixture)).toThrow(/bad filament count/i);
  });

  it('throws when [FILAMENTS DATA] declares more values than the [FILAMENTS] block has vertices', () => {
    // [FILAMENTS] declares one filament with 2 vertices, but we then truncate
    // [FILAMENTS DATA] to only provide one value, leaving the second vertex
    // hanging.  Should throw the new "truncated at strip X vertex Y" error.
    const fixture = `ANDSKEL
3
[FILAMENTS]
1
0 1 2
10 10 10
20 20 20
[FILAMENTS DATA]
1
field_value
0.9
`;
    expect(() => parseNDskl(fixture)).toThrow(/truncated/i);
  });
});

describe('skeletonToFilamentCloud', () => {
  it('flattens strips into the SoA FilamentCloud shape', () => {
    const cloud = skeletonToFilamentCloud({
      strips: [
        {
          vertices: [
            [10, 20, 30],
            [11, 21, 31],
          ],
          density: [0.9, 0.8],
        },
        {
          vertices: [
            [40, 50, 60],
            [41, 51, 61],
            [42, 52, 62],
          ],
          density: [0.7, 0.6, 0.5],
        },
      ],
    });
    expect(cloud.stripCount).toBe(2);
    expect(cloud.vertexCount).toBe(5);
    expect(Array.from(cloud.stripOffsets)).toEqual([0, 2, 5]);
    // Densities are normalised across all surviving vertices: input range
    // is [0.5, 0.9], so 0.5→0, 0.6→0.25, 0.7→0.5, 0.8→0.75, 0.9→1.
    expect(Array.from(cloud.vertices)).toEqual([
      10, 20, 30, 1, 11, 21, 31, 0.75, 40, 50, 60, 0.5, 41, 51, 61, 0.25, 42, 52, 62, 0,
    ]);
  });

  it('drops strips with fewer than 2 vertices', () => {
    // 1-vertex strips are also dropped because a polyline needs at least
    // 2 endpoints to form an edge — a single isolated point can never
    // become a line segment.
    const cloud = skeletonToFilamentCloud({
      strips: [
        { vertices: [], density: [] },
        {
          vertices: [
            [1, 2, 3],
            [4, 5, 6],
          ],
          density: [0.5, 0.5],
        },
      ],
    });
    expect(cloud.stripCount).toBe(1);
    expect(cloud.vertexCount).toBe(2);
  });

  it('drops strips with one vertex (polyline degenerate)', () => {
    const cloud = skeletonToFilamentCloud({
      strips: [
        // A single isolated vertex is degenerate — DisPerSE has been
        // observed to emit these at the very edges of under-resolved
        // volumes.  No edge can connect a single point to itself, so
        // it cannot become a polyline; drop it.
        { vertices: [[1, 2, 3]], density: [0.5] },
        {
          vertices: [
            [4, 5, 6],
            [7, 8, 9],
          ],
          density: [0.4, 0.6],
        },
      ],
    });
    expect(cloud.stripCount).toBe(1);
    expect(cloud.vertexCount).toBe(2);
  });

  it('normalises density to [0, 1] across all strips', () => {
    const cloud = skeletonToFilamentCloud({
      strips: [
        {
          vertices: [
            [0, 0, 0],
            [1, 1, 1],
          ],
          density: [0, 100], // pre-normalisation: min=0, max=100
        },
      ],
    });
    expect(cloud.vertices[3]).toBe(0); // first vertex's density slot, normalised
    expect(cloud.vertices[7]).toBe(1); // second vertex's density slot, normalised
  });
});
