import { describe, expect, it } from 'vitest';
import type { CraftTrail } from '../../../../../src/layers/missions/trails/@types/CraftTrail';
import type { MissionTrailGeometry } from '../../../../../src/layers/missions/trails/@types/MissionTrailGeometry';
import { trailDrawsAt } from '../../../../../src/layers/missions/trails/utils/trailDrawsAt';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

const piece = (centre: string, times: number[]): MissionTrailGeometry => ({
  centreId: asSceneBodyId(centre),
  tDays: Float64Array.from(times),
  relMpc: new Float64Array(3 * times.length),
});

// Sun trail at days 0..10; a stay entered at day 4 and left at day 6, its piece running to day 7.
const trail: CraftTrail = {
  id: 'c',
  whole: piece('sun', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  near: [{ piece: piece('earth', [4, 5, 6, 7]), leaveDays: 6 }],
};

describe('trailDrawsAt', () => {
  it('draws nothing before the track', () => {
    expect(trailDrawsAt(trail, -1)).toEqual([]);
  });

  it('cruise: one Sun draw with a head', () => {
    const draws = trailDrawsAt(trail, 2.5);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ segmentCount: 2, head: true });
    expect(draws[0]!.piece).toBe(trail.whole);
  });

  it('inside a stay: the Sun trail cut at the entry without a head, then the near piece with one', () => {
    const draws = trailDrawsAt(trail, 5.5);
    expect(draws).toHaveLength(2);
    expect(draws[0]).toMatchObject({ segmentCount: 4, head: false, weight: 1, fadeVertex: 4 });
    expect(draws[0]!.piece).toBe(trail.whole);
    expect(draws[1]).toMatchObject({ segmentCount: 1, head: true, weight: 1, fadeVertex: 0 });
    expect(draws[1]!.piece).toBe(trail.near[0]!.piece);
  });

  it('after leaving, the stay picture fades out as the whole Sun trail fades in', () => {
    const draws = trailDrawsAt(trail, 6.5);
    expect(draws.map((d) => d.piece)).toEqual([trail.whole, trail.near[0]!.piece, trail.whole]);
    expect(draws.map((d) => d.weight)).toEqual([0.5, 0.5, 0.5]);
    expect(draws[2]).toMatchObject({ segmentCount: 6, head: true, fadeVertex: -1 });
  });

  it("at the piece's end it is one Sun draw again", () => {
    const draws = trailDrawsAt(trail, 7);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.piece).toBe(trail.whole);
  });

  it('a stay that opens on the first sample draws only its near piece', () => {
    const departing: CraftTrail = {
      id: 'c',
      whole: piece('sun', [0, 1, 2, 3]),
      near: [{ piece: piece('earth', [0, 1, 2]), leaveDays: 2 }],
    };
    const draws = trailDrawsAt(departing, 0.5);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.piece).toBe(departing.near[0]!.piece);
    expect(draws[0]!.fadeVertex).toBe(-1);
  });

  it("past the track's end the single draw has no head", () => {
    const draws = trailDrawsAt(trail, 12);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ segmentCount: 10, head: false });
  });
});
