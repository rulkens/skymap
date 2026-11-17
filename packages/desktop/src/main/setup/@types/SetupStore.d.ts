import type { InstallSetup } from '../../../@types/InstallSetup';

/** The install's setup in memory, and `save`, the settings file's one writer of `setup`. */
export type SetupStore = {
  current: () => InstallSetup;
  save: (next: InstallSetup) => Promise<void>;
};
