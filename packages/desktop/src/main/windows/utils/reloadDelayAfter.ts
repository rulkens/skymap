import { RELOAD_DELAY_MS } from '../data/reloadDelayMs';
import { RELOAD_MAX_DELAY_MS } from '../data/reloadMaxDelayMs';
import { STABLE_UP_MS } from '../data/stableUpMs';

/** The wait before reloading a crashed window: doubling while it keeps crashing, reset once it stayed up. */
export function reloadDelayAfter(lastDelayMs: number | null, upMs: number): number {
  if (lastDelayMs === null || upMs >= STABLE_UP_MS) return RELOAD_DELAY_MS;
  return Math.min(lastDelayMs * 2, RELOAD_MAX_DELAY_MS);
}
