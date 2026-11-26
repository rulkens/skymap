import { describe, expect, it, vi } from 'vitest';
import { satellitesPlanner } from '../../../src/layers/satellites/frame';
import { SATELLITE_PROFILES } from '../../../src/layers/satellites/points/data/satelliteProfiles';
import { julianDaysToUnixMs } from '../../../src/utils/time/julianDaysToUnixMs';
import type { SatellitesRuntime } from '../../../src/layers/satellites/@types/SatellitesRuntime';
import type { SatelliteColors } from '../../../src/layers/satellites/@types/SatelliteColors';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';

const SIM_DAYS = 2461000;
const SNAPSHOT = { simDays: SIM_DAYS, nowMs: 1000 } as ReadyFrameContext;
const FADE = { active: 1, debris: 1, other: 1 } as never;

function planThrough(writeProfiles: SatellitesRuntime['renderer']['writeProfiles']) {
  const planner = satellitesPlanner({
    renderer: { writeProfiles, upload: vi.fn() },
    propagator: {
      catalog: () => ({ fetchedAtMs: julianDaysToUnixMs(SIM_DAYS), classCode: new Uint8Array(0) }),
      latest: () => null,
      request: vi.fn(),
    },
    simRate: { observe: vi.fn() },
    scheduleWake: vi.fn(),
  } as unknown as SatellitesRuntime);
  return (colors: SatelliteColors) =>
    planner.plan(
      SNAPSHOT,
      [],
      { settings: { satelliteTuning: { colors } } } as unknown as PassState,
      FADE,
    );
}

function colorsOf(red: number): SatelliteColors {
  return Object.fromEntries(
    SATELLITE_PROFILES.map(({ id }) => [id, [red, 0, 0]]),
  ) as unknown as SatelliteColors;
}

describe('satellitesPlanner', () => {
  it('the profile table is written once per colour object', () => {
    const writeProfiles = vi.fn();
    const plan = planThrough(writeProfiles);
    const colors = colorsOf(0.1);

    plan(colors);
    plan(colors);
    expect(writeProfiles).toHaveBeenCalledTimes(1);

    plan(colorsOf(0.2));
    expect(writeProfiles).toHaveBeenCalledTimes(2);
    expect(writeProfiles.mock.calls[1]![0]![0]).toBeCloseTo(0.2);
  });
});
