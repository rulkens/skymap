import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom';
import type { AboutInfo } from './AboutInfo';
import type { ControlStatus } from './ControlStatus';
import type { DisplayInfo } from './DisplayInfo';
import type { InstallSetup } from './InstallSetup';
import type { LanInterface } from './LanInterface';
import type { SyncProgress } from './SyncProgress';
import type { WindowPlacement } from './WindowPlacement';

/** Everything the control page shows. Main owns it and pushes it whole on every change. */
export type ControlState = {
  status: ControlStatus;
  /** The running or last download's bytes; null from a sync's start until it has planned. */
  progress: SyncProgress | null;
  /** A complete data set is on disk, so the sky can start without a download. */
  hasData: boolean;
  skyRunning: boolean;
  /** A sky load is under way (a restart, a mode change, a sync's reload): up to 10 s of black. */
  skyLoading: boolean;
  /** Whether the test grid is on the sky; the View menu's tick reads the same value. */
  testGrid: boolean;
  room: RelayRoom;
  displays: DisplayInfo[];
  /** Where the sky is placed on `displays`; null while none are reported. */
  placement: WindowPlacement | null;
  networks: LanInterface[];
  setup: InstallSetup;
  /** True on the launch that found no setup.json. */
  firstRun: boolean;
  about: AboutInfo;
};
