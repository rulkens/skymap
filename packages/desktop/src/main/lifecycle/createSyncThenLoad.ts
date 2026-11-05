import type { SyncOutcome } from '../sync/@types/SyncOutcome';
import type { SyncThenLoadDeps } from './@types/SyncThenLoadDeps';
import { syncOutcomeAction } from './utils/syncOutcomeAction';

/**
 * A sync, then what spec §5's table says follows it; never rejects, and always ends the syncing
 * status. `restart` is a launch or daily sync, which ends in a sky load; Update now waits for
 * Restart sky. A second call while one runs does nothing.
 */
export function createSyncThenLoad(deps: SyncThenLoadDeps): (restart: boolean) => Promise<void> {
  let syncing = false;
  return async (restart) => {
    if (syncing) return;
    syncing = true;
    const skyStale = deps.state().status.kind === 'ready';
    deps.update({ status: { kind: 'syncing' }, progress: null });
    const outcome = await deps
      .sync()
      .catch((error: unknown): SyncOutcome => {
        console.error('sync:', error);
        return { kind: 'failed' };
      })
      .finally(() => (syncing = false));
    const done = outcome.kind === 'synced' || outcome.kind === 'unchanged';
    // The walk can throw (EPERM on a folder antivirus holds); a set it cannot read is not complete.
    const hasData =
      done ||
      (await deps.hasCompleteSet().catch((error: unknown) => {
        console.error('data check:', error);
        return false;
      }));
    const action = syncOutcomeAction({
      outcome,
      hasData,
      skyRunning: deps.state().skyRunning,
      skyStale,
      restart,
    });
    deps.update({
      status: action.status,
      hasData,
      about: await deps.readAbout(),
      lastAttempt: Date.now(),
    });
    if (action.then === 'showControl') deps.showControl();
    if (action.then === 'loadSky') await deps.loadSky();
  };
}
