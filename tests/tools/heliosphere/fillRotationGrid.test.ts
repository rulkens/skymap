import { describe, it, expect } from 'vitest';
import { fillRotationGrid } from '../../../tools/heliosphere/fillRotationGrid';

const column = (v: number): number[] => Array.from({ length: 30 }, () => v);
const chartOf = (lons: number[], v: number): Map<number, number[]> =>
  new Map(lons.map((lon) => [lon, column(v)]));
const allLons = Array.from({ length: 72 }, (_, i) => i * 5);

describe('fillRotationGrid', () => {
  it('prefers radial, then classic, then the previous rotation, per longitude', () => {
    const radial = chartOf(allLons.slice(2), 1);
    const classic = chartOf([5], 2);
    const previous = allLons.map(() => column(3));
    const { grid, usedClassicModel, usedPreviousRotation } = fillRotationGrid(
      radial,
      classic,
      previous,
    );
    expect([grid[0]![0], grid[1]![0], grid[2]![0]]).toEqual([3, 2, 1]);
    expect(usedClassicModel && usedPreviousRotation).toBe(true);
  });

  it('throws when a longitude has no source at all', () => {
    expect(() => fillRotationGrid(new Map(), new Map(), null)).toThrow(/longitude 0/);
  });
});
