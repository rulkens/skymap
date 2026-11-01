/**
 * sweepDue — whether the planner should ask the worker for a fresh sweep this frame
 * (`SATELLITE_SWEEP_TIMING` says when and why). A paused clock costs one sweep and then nothing.
 */
import { SATELLITE_SWEEP_TIMING as T } from '../../../data/satellites/satelliteSweepTiming';

/** `last.atMs` is the frame clock (`ReadyFrameContext.nowMs`) when that sweep was first drawn. */
export function sweepDue(
  last: { readonly simMs: number; readonly atMs: number } | null,
  simMs: number,
  nowMs: number,
): boolean {
  if (last === null) return true;
  const simAge = Math.abs(simMs - last.simMs);
  return simAge > T.maxSimAgeMs || (simAge > 0 && nowMs - last.atMs >= T.realIntervalMs);
}
