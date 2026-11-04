import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom';
import type { Unsubscribe } from '../../../../src/@types/remote/Unsubscribe';
import type { ControlStatus } from './ControlStatus';
import type { DisplayInfo } from './DisplayInfo';
import type { InstallSetup } from './InstallSetup';
import type { LanInterface } from './LanInterface';
import type { SyncProgress } from './SyncProgress';

/** Everything the control page may ask of the main process; exposed through contextBridge only. */
export type ControlBridge = {
  onSync: (listener: (progress: SyncProgress) => void) => Unsubscribe;
  onStatus: (listener: (status: ControlStatus) => void) => Unsubscribe;
  updateNow: () => void;
  restartSky: () => void;
  getSetup: () => Promise<InstallSetup>;
  saveSetup: (setup: InstallSetup) => Promise<void>;
  listDisplays: () => Promise<DisplayInfo[]>;
  listNetworks: () => Promise<LanInterface[]>;
  showTestGrid: (on: boolean) => void;
  onPairing: (listener: (room: RelayRoom) => void) => Unsubscribe;
  rotateCode: () => void;
  quit: () => void;
};
