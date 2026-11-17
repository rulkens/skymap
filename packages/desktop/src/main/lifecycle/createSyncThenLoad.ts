import type { SyncOutcome } from '../sync/@types/SyncOutcome';
import type { SyncThenLoad } from './@types/SyncThenLoad';
import type { SyncThenLoadDeps } from './@types/SyncThenLoadDeps';
import { errorDetail } from '../sync/utils/errorDetail';
import { syncOutcomeAction } from './utils/syncOutcomeAction';

/**
 * A sync, then what spec §5's table says follows it; never rejects, and always ends the syncing
 * status. `restart` is a launch or daily sync, which ends in a sky load; Update now waits for
 * Restart sky. A second call while one runs does nothing. A sync after a pause counts its bytes on
 * from the paused one's, so the bar resumes where it stopped.
 */
export function createSyncThenLoad(deps: SyncThenLoadDeps): SyncThenLoad {
  let running: AbortController | null = null;
  const syncThenLoad = async (restart: boolean): Promise<void> => {
    if (running !== null) return;
    const controller = new AbortController();
    running = controller;
    const before = deps.state();
    const skyStale = before.status.kind === 'ready';
    const carried = before.status.kind === 'paused' ? before.progress : null;
    const carry = carried?.doneBytes ?? 0;
    deps.update({ status: { kind: 'syncing' }, progress: carried });
    const outcome = await deps
      .sync(controller.signal, ({ doneBytes, totalBytes }) =>
        deps.update({ progress: { doneBytes: carry + doneBytes, totalBytes: carry + totalBytes } }),
      )
      .catch((error: unknown): SyncOutcome => {
        console.error('sync:', error);
        return {
          kind: 'failed',
          failure: { reason: 'error', key: null, detail: errorDetail(error) },
        };
      })
      .finally(() => (running = null));
    if (outcome.kind === 'failed') console.error('sync failed:', outcome.failure);
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
  return { syncThenLoad, pause: () => running?.abort() };
}
