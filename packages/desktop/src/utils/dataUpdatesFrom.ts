import type { DataUpdates } from '../@types/DataUpdates';

/** A daily schedule needs a time; with the field cleared, the sync falls back to every launch. */
export function dataUpdatesFrom(kind: DataUpdates['kind'], at: string): DataUpdates {
  if (kind === 'daily') return at ? { kind, at } : { kind: 'atLaunch' };
  return { kind };
}
