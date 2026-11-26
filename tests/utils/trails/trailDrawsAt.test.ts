import { describe, expect, it } from 'vitest';
import type { SampledTrail } from '../../../src/@types/rendering/sampledTrailRenderer/SampledTrail';
import type { SampledTrailGeometry } from '../../../src/@types/rendering/sampledTrailRenderer/SampledTrailGeometry';
import {
  TRAIL_ENTRY_FADE_REACH,
  TRAIL_STAY_FADE,
} from '../../../src/data/bodies/sampledTrailStyle';
import { trailDrawsAt } from '../../../src/utils/trails/trailDrawsAt';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

// Every vertex sits `startMpc` along x from its centre: only the first one's distance is read.
const piece = (centre: string, times: number[], startMpc = 0): SampledTrailGeometry => ({
  centreId: asSceneBodyId(centre),
  tDays: Float64Array.from(times),
  relMpc: Float64Array.from(times.flatMap(() => [startMpc, 0, 0])),
});
const SUN = { fadeMaxMpc: 0 };

// Sun trail at days 0..30; a stay entered at day 10 and left at day 20, so each cross-fade
// lasts FADE days: the rise 10 → 10 + FADE, the fall 20 → 20 + FADE (the piece's last time).
const FADE = TRAIL_STAY_FADE * 10;
const whole = piece(
  'sun',
  Array.from({ length: 31 }, (_, i) => i),
);
const stay = piece('jupiter', [10, 12, 14, 16, 18, 20, 20 + FADE], 4);
const trail: SampledTrail = { id: 'c', whole, near: [{ piece: stay, leaveDays: 20 }] };

describe('trailDrawsAt', () => {
  it('draws nothing before the track', () => {
    expect(trailDrawsAt(trail, -1, true)).toEqual([]);
  });

  it('planet frames off: one Sun draw, even inside a stay', () => {
    const draws = trailDrawsAt(trail, 15.5, false);
    expect(draws).toEqual([{ piece: whole, segmentCount: 15, head: true, weight: 1, ...SUN }]);
  });

  it('outside every stay: one Sun draw with a head', () => {
    const draws = trailDrawsAt(trail, 2.5, true);
    expect(draws).toEqual([{ piece: whole, segmentCount: 2, head: true, weight: 1, ...SUN }]);
  });

  it('mid-stay: only the planet piece, up to the craft, fading toward where it entered', () => {
    const draws = trailDrawsAt(trail, 15, true);
    expect(draws).toEqual([
      {
        piece: stay,
        segmentCount: 2,
        head: true,
        weight: 1,
        fadeMaxMpc: TRAIL_ENTRY_FADE_REACH * 4,
      },
    ]);
  });

  it('at the entry instant it is still the Sun trail alone', () => {
    const draws = trailDrawsAt(trail, 10, true);
    expect(draws.map((d) => d.piece)).toEqual([whole]);
    expect(draws[0]!.weight).toBe(1);
  });

  it('during the entry rise both draw up to the craft, weights summing to 1', () => {
    const early = trailDrawsAt(trail, 10 + FADE / 4, true);
    const half = trailDrawsAt(trail, 10 + FADE / 2, true);
    expect(half.map((d) => d.piece)).toEqual([whole, stay]);
    expect(half.map((d) => d.head)).toEqual([true, true]);
    // The Sun trail runs whole to the craft: only the planet piece has a loose end to fade.
    expect(half[0]!.fadeMaxMpc).toBe(0);
    expect(half[1]!.fadeMaxMpc).toBeGreaterThan(0);
    expect(half[0]!.segmentCount).toBe(10);
    expect(half[0]!.weight).toBeCloseTo(0.5, 12);
    expect(half[1]!.weight).toBeCloseTo(0.5, 12);
    // The planet piece comes in, the Sun trail goes out.
    expect(early[1]!.weight).toBeLessThan(0.5);
    expect(early[0]!.weight + early[1]!.weight).toBeCloseTo(1, 12);
  });

  it('during the exit fall both draw, the planet piece going out', () => {
    const half = trailDrawsAt(trail, 20 + FADE / 2, true);
    const late = trailDrawsAt(trail, 20 + (3 * FADE) / 4, true);
    expect(half.map((d) => d.piece)).toEqual([whole, stay]);
    expect(half[0]).toMatchObject({ segmentCount: 20, head: true });
    expect(half[0]!.weight).toBeCloseTo(0.5, 12);
    expect(half[1]!.weight).toBeCloseTo(0.5, 12);
    expect(late[1]!.weight).toBeLessThan(0.5);
  });

  it("at the piece's end it is one Sun draw again", () => {
    const draws = trailDrawsAt(trail, 20 + FADE, true);
    expect(draws.map((d) => d.piece)).toEqual([whole]);
    expect(draws[0]!.weight).toBe(1);
  });

  it('a stay that opens the track is the planet piece alone from the first instant', () => {
    const launch = piece('earth', [0, 1, 2, 2.3], 4);
    const departing: SampledTrail = {
      id: 'c',
      whole: piece('sun', [0, 1, 2, 3]),
      near: [{ piece: launch, leaveDays: 2 }],
    };
    expect(trailDrawsAt(departing, 0, true)).toEqual([
      { piece: launch, segmentCount: 0, head: true, weight: 1, ...SUN },
    ]);
    expect(trailDrawsAt(departing, 0.05, true).map((d) => d.piece)).toEqual([launch]);
  });

  it("past the track's end the single draw has no head", () => {
    const draws = trailDrawsAt(trail, 32, true);
    expect(draws).toEqual([{ piece: whole, segmentCount: 30, head: false, weight: 1, ...SUN }]);
  });
});
