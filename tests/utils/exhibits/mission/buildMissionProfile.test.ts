import { beforeAll, describe, expect, it } from 'vitest';

import { MISSION_LEG_WALL_MS } from '../../../../src/data/exhibits/mission/missionLegWallMs';
import { MISSION_RAMP_MS } from '../../../../src/data/exhibits/mission/missionRampMs';
import { MISSION_SPEEDS } from '../../../../src/data/exhibits/mission/missionSpeeds';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { buildMissionProfile } from '../../../../src/utils/exhibits/mission/buildMissionProfile';
import { missionStops } from '../../../../src/utils/exhibits/mission/missionStops';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { loadVoyagerStopWindows } from '../../../helpers/missions/loadVoyagerStopWindows';
import type { MissionProfile } from '../../../../src/@types/time/MissionProfile';

const stops = missionStops(MISSION_EVENTS.filter((e) => e.bodyId === 'voyager2'));
const bounds = stops.map((s) => unixMsToJulianDays(s.ms));
const END = unixMsToJulianDays(Date.parse('2026-10-06'));
const ONE = MISSION_SPEEDS.indexOf(1);
const FOUR = MISSION_SPEEDS.indexOf(4);
/** The profile's integration step, ms. */
const STEP_MS = 50;

/** Wall ms each leg took: the profile lands a sample exactly on every boundary it crosses. */
function legWallMs(p: MissionProfile): number[] {
  const at = (days: number) => p.wallMs[p.simDays.indexOf(days)]!;
  return [...bounds, END].slice(1).map((to, i) => at(to) - at(bounds[i]!));
}

let atOne: MissionProfile;
let atFour: MissionProfile;
beforeAll(() => {
  loadVoyagerStopWindows();
  atOne = buildMissionProfile(stops, 'voyager2', bounds[0]!, END, ONE, 1234);
  atFour = buildMissionProfile(stops, 'voyager2', bounds[0]!, END, FOUR, 0);
});

describe('buildMissionProfile', () => {
  it('is strictly monotone in both columns, from the given instant to the end', () => {
    expect(atOne.startWallMs).toBe(1234);
    expect(atOne.speedIndex).toBe(ONE);
    expect(atOne.simDays[0]).toBe(bounds[0]);
    expect(atOne.simDays.at(-1)).toBe(END);
    for (let i = 1; i < atOne.wallMs.length; i++) {
      expect(atOne.wallMs[i]!).toBeGreaterThan(atOne.wallMs[i - 1]!);
      expect(atOne.simDays[i]!).toBeGreaterThan(atOne.simDays[i - 1]!);
    }
  });

  it('plays a leg with no planet in MISSION_LEG_WALL_MS / factor, and a planet leg slower', () => {
    const one = legWallMs(atOne);
    const four = legWallMs(atFour);
    // The last two legs (termination shock → heliopause → now) never come near a planet.
    for (const ms of one.slice(-2)) expect(ms).toBeCloseTo(MISSION_LEG_WALL_MS, 6);
    for (const ms of four.slice(-2)) expect(ms).toBeCloseTo(MISSION_LEG_WALL_MS / 4, 6);
    // Launch, Jupiter, Saturn, Uranus and Neptune legs are capped near their planets.
    for (const ms of one.slice(0, -2)) expect(ms).toBeGreaterThan(1.5 * MISSION_LEG_WALL_MS);
  });

  it.each([
    ['1×', () => atOne],
    ['4×', () => atFour],
  ])('never speeds up more than e-fold per MISSION_RAMP_MS at %s', (_, profile) => {
    const p = profile();
    const rates = Array.from(p.wallMs.subarray(1), (w, i) => {
      return (p.simDays[i + 1]! - p.simDays[i]!) / (w - p.wallMs[i]!);
    });
    // Per integration step, the unit the ramp is applied in.
    const worst = Math.max(...rates.slice(1).map((r, i) => Math.log(r / rates[i]!)));
    expect(worst).toBeLessThan(STEP_MS / MISSION_RAMP_MS + 1e-6);
  });

  it('runs slowest at Neptune within an hour of closest approach', () => {
    const neptune = unixMsToJulianDays(
      Date.parse(MISSION_EVENTS.find((e) => e.id === 'voyager2-neptune')!.iso),
    );
    let slowest = 0;
    let slowestRate = Infinity;
    for (let i = 0; i + 1 < atOne.wallMs.length; i++) {
      const t = atOne.simDays[i]!;
      if (Math.abs(t - neptune) > 10) continue;
      const rate = (atOne.simDays[i + 1]! - t) / (atOne.wallMs[i + 1]! - atOne.wallMs[i]!);
      if (rate < slowestRate) [slowest, slowestRate] = [t, rate];
    }
    expect(Math.abs(slowest - neptune) * 24).toBeLessThan(1);
  });

  it('starts mid-leg from the given instant', () => {
    const mid = (bounds[2]! + bounds[3]!) / 2;
    const p = buildMissionProfile(stops, 'voyager2', mid, END, ONE, 0);
    expect(p.simDays[0]).toBe(mid);
    expect(p.simDays.at(-1)).toBe(END);
  });
});
