import type { AboutInfo } from '../../../@types/AboutInfo';
import type { ControlState } from '../../../@types/ControlState';
import type { SyncOutcome } from '../../sync/@types/SyncOutcome';

/** What a sync and the sky load after it need from the app (createSyncThenLoad). */
export type SyncThenLoadDeps = {
  /** One sync of the mirror, queued with prunes and sky loads. */
  sync: () => Promise<SyncOutcome>;
  hasCompleteSet: () => Promise<boolean>;
  state: () => ControlState;
  update: (patch: Partial<ControlState>) => void;
  readAbout: () => Promise<AboutInfo>;
  showControl: () => void;
  loadSky: () => Promise<void>;
};
