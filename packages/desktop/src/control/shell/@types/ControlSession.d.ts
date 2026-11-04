import type { ControlState } from '../../../@types/ControlState';
import type { InstallSetup } from '../../../@types/InstallSetup';
import type { SetupSaveState } from '../../setup/@types/SetupSaveState';

/** Main's state as the page shows it, with the setup save in flight laid over `setup`. */
export type ControlSession = ControlState & {
  saveState: SetupSaveState;
  /** Resolves once main has applied the change (a moved sky included). */
  save: (next: InstallSetup) => Promise<void>;
};
