import type { RootState } from '../../store/types';

/** selectSimRunning — whether the sim is stepping: a lost device stops the frame loop but leaves `sim.running` set. */
export function selectSimRunning(s: RootState): boolean {
  return s.sim.running && !s.view.deviceLost;
}
