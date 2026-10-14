import { beforeAll, describe, expect, it } from 'vitest';

import type { MissionFrame } from '../../../../src/@types/missions/MissionFrame';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { bodyPositionMpcAt } from '../../../../src/utils/exhibits/mission/bodyPositionMpcAt';
import { missionFrame } from '../../../../src/utils/exhibits/mission/missionFrame';
import { missionStops } from '../../../../src/utils/exhibits/mission/missionStops';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { loadVoyagerStopWindows } from '../../../helpers/missions/loadVoyagerStopWindows';

beforeAll(loadVoyagerStopWindows);

/**
 * Offsets in days around a stop, finest where the frame is smallest: a flyby or a launch crosses
 * its frame in hours, so every minute within a day, every 10 min within 5 d, hourly out to 30 d.
 */
const OFFSETS: number[] = [];
for (let h = -30 * 24; h <= 30 * 24; h++) {
  const perHour = Math.abs(h) < 24 ? 60 : Math.abs(h) < 120 ? 6 : 1;
  for (let k = 0; k < perHour; k++) OFFSETS.push((h + k / perHour) / 24);
}

describe.each(['voyager1', 'voyager2'])('missionFrame — %s', (craft) => {
  const stops = missionStops(MISSION_EVENTS.filter((e) => e.bodyId === craft));
  let samples: number[] = [];
  let frames: { craft: readonly number[]; frame: MissionFrame }[] = [];
  beforeAll(() => {
    samples = stops.flatMap((stop, i) => {
      const t0 = unixMsToJulianDays(stop.ms);
      // The craft sits at Earth's centre until its track starts, about an hour after launch.
      const from = i === 0 ? trajectoryRegistry.get(craft)!.tDays[0]! : -Infinity;
      return OFFSETS.map((d) => t0 + d).filter((t) => t >= from);
    });
    frames = samples.map((t) => {
      const at = (id: string) => bodyPositionMpcAt(id, t);
      return { craft: at(craft), frame: missionFrame(stops, craft, t, at)! };
    });
  });

  it('contains the craft at every sampled instant within ±30 d of every stop', () => {
    const worst = Math.max(
      ...frames.map(({ craft: c, frame: f }) => {
        return Math.hypot(c[0]! - f.aim[0], c[1]! - f.aim[1], c[2]! - f.aim[2]) / f.radiusMpc;
      }),
    );
    expect(worst).toBeLessThan(1);
  });

  it('moves by a small fraction of its radius between adjacent samples on one stop', () => {
    let worst = 0;
    for (let i = 1; i < frames.length; i++) {
      if (samples[i]! - samples[i - 1]! > 1 / 24 + 1e-9) continue; // the gap between two stops' windows
      const a = frames[i - 1]!.frame;
      const b = frames[i]!.frame;
      if (a.stop !== b.stop) continue; // the hand-off is a hard switch the camera eases across
      const r = Math.min(a.radiusMpc, b.radiusMpc);
      const shift = Math.hypot(a.aim[0] - b.aim[0], a.aim[1] - b.aim[1], a.aim[2] - b.aim[2]) / r;
      worst = Math.max(worst, shift, Math.abs(Math.log(a.radiusMpc / b.radiusMpc)));
    }
    expect(worst).toBeLessThan(0.15);
  });
});
