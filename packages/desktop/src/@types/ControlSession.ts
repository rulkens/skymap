import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom';
import type { ControlStatus } from './ControlStatus';
import type { DisplayInfo } from './DisplayInfo';
import type { InstallSetup } from './InstallSetup';
import type { LanInterface } from './LanInterface';
import type { SetupSaveState } from './SetupSaveState';
import type { SyncProgress } from './SyncProgress';

/** The control page's view of the main process; `setup` and `firstRun` are null until the first read returns. */
export type ControlSession = {
  status: ControlStatus;
  progress: SyncProgress | null;
  skyRunning: boolean;
  room: RelayRoom | null;
  setup: InstallSetup | null;
  firstRun: boolean | null;
  displays: readonly DisplayInfo[];
  networks: readonly LanInterface[];
  saveState: SetupSaveState;
  /** Resolves once main has applied the change (a moved sky included). */
  save: (next: InstallSetup) => Promise<void>;
};
