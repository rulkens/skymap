import type { RelayRoom } from '../../../../../../src/@types/remote/RelayRoom';
import type { ControlStatus } from '../../../@types/ControlStatus';
import type { DisplayInfo } from '../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../@types/InstallSetup';
import type { LanInterface } from '../../../@types/LanInterface';
import type { SetupSaveState } from '../../setup/@types/SetupSaveState';
import type { SyncProgress } from '../../../@types/SyncProgress';

/** The control page's view of the main process; `setup` and `firstRun` are null until the first read returns. */
export type ControlSession = {
  status: ControlStatus;
  progress: SyncProgress | null;
  skyRunning: boolean;
  testGrid: boolean;
  room: RelayRoom | null;
  setup: InstallSetup | null;
  firstRun: boolean | null;
  displays: readonly DisplayInfo[];
  networks: readonly LanInterface[];
  saveState: SetupSaveState;
  /** Resolves once main has applied the change (a moved sky included). */
  save: (next: InstallSetup) => Promise<void>;
};
