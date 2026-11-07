import type { DailyScheduleDeps } from './@types/DailyScheduleDeps';
import { nextDailyRun } from '../sync/utils/nextDailyRun';

/**
 * The daily sync's one timer. The returned `rearm` drops any timer and sets the next from the
 * current policy; a run re-arms when it settles, a failed one too. Dev runs never arm.
 */
export function createDailySchedule({ run, policy, dev }: DailyScheduleDeps): () => void {
  let timer: NodeJS.Timeout | undefined;
  const rearm = (): void => {
    clearTimeout(timer);
    const updates = policy();
    if (dev || updates.kind !== 'daily') return;
    const wait = nextDailyRun(updates.at, new Date()).getTime() - Date.now();
    timer = setTimeout(() => {
      void run()
        .catch((error: unknown) => console.error('daily update:', error))
        .finally(rearm);
    }, wait);
  };
  return rearm;
}
