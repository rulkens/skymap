import { describe, expect, it } from 'vitest';

import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { JULIAN_YEAR_DAYS } from '../../../src/data/time/julianYearDays';
import { VOYAGE_DESTINATIONS } from '../../../src/data/voyage/voyageDestinations';
import { VOYAGE_WALL_MS } from '../../../src/data/voyage/voyageWallMs';
import { tripOf } from '../../../src/utils/relativity/tripOf';
import { buildVoyageProfile } from '../../../src/utils/voyage/buildVoyageProfile';
import { voyageTripLy } from '../../../src/utils/voyage/voyageTripLy';

const M31 = VOYAGE_DESTINATIONS.m31;
const LAUNCH = CONST_J2000;
const trip = tripOf(voyageTripLy(M31));
const arrival = LAUNCH + trip.tEarthTotalYr * JULIAN_YEAR_DAYS;

describe('buildVoyageProfile', () => {
  it('buildVoyageProfile is monotone in both columns', () => {
    for (const id of ['proxima', 'm87'] as const) {
      const p = buildVoyageProfile(VOYAGE_DESTINATIONS[id], LAUNCH, LAUNCH, 1, 0);
      for (let i = 1; i < p.wallMs.length; i++) {
        expect(p.wallMs[i]!).toBeGreaterThan(p.wallMs[i - 1]!);
        expect(p.simDays[i]!).toBeGreaterThan(p.simDays[i - 1]!);
      }
    }
  });

  it('buildVoyageProfile starts at fromDays and ends at arrival', () => {
    const from = LAUNCH + 1e5 * JULIAN_YEAR_DAYS;
    const p = buildVoyageProfile(M31, from, LAUNCH, 1, 1234);
    expect(p.startWallMs).toBe(1234);
    expect(p.wallMs[0]).toBe(0);
    expect(p.simDays[0]).toBe(from);
    expect(p.simDays.at(-1)!).toBeCloseTo(arrival, 3);
  });

  it('buildVoyageProfile halves its wall length at speed 2', () => {
    const one = buildVoyageProfile(M31, LAUNCH, LAUNCH, 1, 0);
    const two = buildVoyageProfile(M31, LAUNCH, LAUNCH, 2, 0);
    expect(one.wallMs.at(-1)!).toBeCloseTo(VOYAGE_WALL_MS, 6);
    expect(two.wallMs.at(-1)!).toBeCloseTo(VOYAGE_WALL_MS / 2, 6);
  });

  it('buildVoyageProfile samples ship time uniformly', () => {
    const p = buildVoyageProfile(M31, LAUNCH, LAUNCH, 1, 0);
    const step = p.wallMs[1]! - p.wallMs[0]!;
    for (let i = 1; i < p.wallMs.length; i++) {
      expect(p.wallMs[i]! - p.wallMs[i - 1]!).toBeCloseTo(step, 9);
    }
  });
});
