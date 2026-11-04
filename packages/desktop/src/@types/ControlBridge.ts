import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom.js';
import type { Unsubscribe } from '../../../../src/@types/remote/Unsubscribe.js';
import type { ControlStatus } from './ControlStatus.js';
import type { DisplayInfo } from './DisplayInfo.js';
import type { InstallSetup } from './InstallSetup.js';
import type { LanInterface } from './LanInterface.js';
import type { SyncProgress } from './SyncProgress.js';

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
