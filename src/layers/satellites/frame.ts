/**
 * satellitesPlanner — the Layer's once-per-frame CPU row: upload a sweep that has landed, and ask
 * for the next one only on a frame that draws points (spec §5.5), so a hidden tab, a paused clock,
 * a camera far from Earth or a sim time outside the data window cost no SGP4 at all. Votes no
 * `awake`: a landed sweep wakes the loop itself, and each upload books the next wake a second on.
 */
import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { SatellitesRuntime } from './@types/SatellitesRuntime';
import type { SatelliteSweep } from './@types/SatelliteSweep';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { satelliteLayerOpacity } from './subsystems/satelliteLayerOpacity';
import { sweepDue } from './subsystems/sweepDue';
import { SATELLITE_CLASSES } from '../../data/satellites/satelliteClasses';

const IDLE = { value: undefined, awake: false, settling: false } as const;

export function satellitesPlanner(
  runtime: SatellitesRuntime,
): Extract<FrameContentPlanner<void, 'satellites'>, { scope: 'once' }> {
  let drawn: { sweep: SatelliteSweep; simMs: number; atMs: number } | null = null;
  return {
    name: 'satellites',
    scope: 'once',
    fade: 'satellites',
    hasDistanceBand: true,
    plan(snapshot, _views, _state, fade) {
      const { propagator, renderer } = runtime;
      const simMs = julianDaysToUnixMs(snapshot.simDays);
      runtime.simRate.observe(simMs, snapshot.nowMs);
      const catalog = propagator.catalog();
      if (catalog === null) return IDLE;
      if (!SATELLITE_CLASSES.some((cls) => fade[cls] > 0)) return IDLE;
      if (satelliteLayerOpacity(catalog, snapshot.simDays) <= 0) return IDLE;

      const latest = propagator.latest();
      if (latest !== null && latest !== drawn?.sweep) {
        renderer.upload(latest, catalog.classCode);
        drawn = { sweep: latest, simMs: latest.simMs, atMs: snapshot.nowMs };
        runtime.scheduleWake();
      }
      if (latest === null) drawn = null;
      if (sweepDue(drawn, simMs, snapshot.nowMs)) propagator.request(simMs);
      return IDLE;
    },
  };
}
