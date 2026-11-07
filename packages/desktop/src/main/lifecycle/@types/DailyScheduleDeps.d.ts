import type { DataUpdates } from '../../../@types/DataUpdates';

/** What the daily timer runs, the policy it reads at every arming, and whether this is a dev run. */
export type DailyScheduleDeps = {
  run: () => Promise<void>;
  policy: () => DataUpdates;
  dev: boolean;
};
