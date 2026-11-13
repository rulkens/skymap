import type { SkyEntryFacts } from '../../@types/engine/SkyEntryFacts';
import { SKY_ENTRY_MAX_ALT_M } from '../../data/sky/skyEntryMaxAltM';
import { SKY_ENTRY_REPUBLISH_M } from '../../data/sky/skyEntryRepublishM';

/** Whether `next` is news to a reader of `prev`: the spot appeared, left, or moved over a metre, or the altitude gate flipped. */
export function skyEntryChanged(prev: SkyEntryFacts, next: SkyEntryFacts): boolean {
  if (prev.altitudeM < SKY_ENTRY_MAX_ALT_M !== next.altitudeM < SKY_ENTRY_MAX_ALT_M) return true;
  const a = prev.pointLocalM;
  const b = next.pointLocalM;
  if (a === null || b === null) return a !== b;
  return (
    prev.spot?.body !== next.spot?.body ||
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > SKY_ENTRY_REPUBLISH_M
  );
}
