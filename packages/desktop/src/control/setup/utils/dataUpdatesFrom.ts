import type { DataUpdates } from '../../../@types/DataUpdates';

/** The schedule a radio pick means; only a daily one keeps the time. */
export function dataUpdatesFrom(kind: DataUpdates['kind'], at: string): DataUpdates {
  return kind === 'daily' ? { kind, at } : { kind };
}
