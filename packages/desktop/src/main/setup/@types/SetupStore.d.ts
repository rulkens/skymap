import type { InstallSetup } from '../../../@types/InstallSetup';

/** The install's setup in memory, and `save`, setup.json's one writer. */
export type SetupStore = {
  current: () => InstallSetup;
  save: (next: InstallSetup) => Promise<void>;
};
