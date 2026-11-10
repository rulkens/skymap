/** Keeps the dock between its minimum and the share that leaves the 3D view 35% of the viewport. */
import { MAX_DOCK_FRACTION, MIN_DOCK_FRACTION } from '../hooks/useDockHeight.constants';

export function clampDockFraction(fraction: number): number {
  return Math.min(MAX_DOCK_FRACTION, Math.max(MIN_DOCK_FRACTION, fraction));
}
