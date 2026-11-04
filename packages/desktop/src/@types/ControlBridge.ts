import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom';
import type { Unsubscribe } from '../../../../src/@types/remote/Unsubscribe';
import type { AboutInfo } from './AboutInfo';
import type { ControlStatus } from './ControlStatus';
import type { ControlView } from './ControlView';
import type { DisplayInfo } from './DisplayInfo';
import type { HelpSection } from './HelpSection';
import type { InstallSetup } from './InstallSetup';
import type { LanInterface } from './LanInterface';
import type { SyncProgress } from './SyncProgress';

/** Everything the control page may ask of the main process; exposed through contextBridge only. */
export type ControlBridge = {
  onSync: (listener: (progress: SyncProgress) => void) => Unsubscribe;
  onStatus: (listener: (status: ControlStatus) => void) => Unsubscribe;
  /** True once the sky window has loaded the app; Finish waits on it. */
  onSky: (listener: (running: boolean) => void) => Unsubscribe;
  onDisplays: (listener: (displays: DisplayInfo[]) => void) => Unsubscribe;
  /** A view main asks for, as a menu's Help item does, with the Help section it names. */
  onView: (listener: (view: ControlView, section?: HelpSection) => void) => Unsubscribe;
  /** Whether the test grid is on the sky; main holds it, so the View menu's tick agrees. */
  onTestGrid: (listener: (on: boolean) => void) => Unsubscribe;
  updateNow: () => void;
  restartSky: () => void;
  /** True on the launch that found no setup.json. */
  isFirstRun: () => Promise<boolean>;
  getSetup: () => Promise<InstallSetup>;
  saveSetup: (setup: InstallSetup) => Promise<void>;
  listDisplays: () => Promise<DisplayInfo[]>;
  listNetworks: () => Promise<LanInterface[]>;
  getAbout: () => Promise<AboutInfo>;
  showTestGrid: (on: boolean) => void;
  onPairing: (listener: (room: RelayRoom) => void) => Unsubscribe;
  rotateCode: () => void;
  /** Hides this window, as the shortcut does, so a single screen shows the sky. */
  hide: () => void;
  quit: () => void;
};
