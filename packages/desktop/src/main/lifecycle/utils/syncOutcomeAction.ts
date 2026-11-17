import type { SyncOutcomeAction } from '../@types/SyncOutcomeAction';
import type { SyncOutcomeFacts } from '../@types/SyncOutcomeFacts';

/** Spec §5's outcome table. Without a complete data set nothing can load, so a person is asked in. */
export function syncOutcomeAction(facts: SyncOutcomeFacts): SyncOutcomeAction {
  const { outcome, hasData, skyRunning, skyStale, restart } = facts;
  if (outcome.kind === 'synced' || outcome.kind === 'unchanged') {
    const changed = outcome.kind === 'synced' || skyStale;
    if (!skyRunning || (restart && changed))
      return { status: { kind: 'complete' }, then: 'loadSky' };
    return { status: { kind: changed ? 'ready' : 'complete' }, then: 'none' };
  }
  if (!hasData) return { status: outcome, then: 'showControl' };
  return { status: outcome, then: skyRunning ? 'none' : 'loadSky' };
}
