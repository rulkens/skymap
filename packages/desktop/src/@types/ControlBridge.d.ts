import type { Unsubscribe } from '../../../../src/@types/remote/Unsubscribe';
import type { ControlState } from './ControlState';
import type { HelpSection } from './HelpSection';
import type { InstallSetup } from './InstallSetup';

/** Everything the control page may ask of the main process; exposed through contextBridge only. */
export type ControlBridge = {
  getState: () => Promise<ControlState>;
  onState: (listener: (state: ControlState) => void) => Unsubscribe;
  /** Main asks for Help, as a menu's Help item does, at the section it names. */
  onHelp: (listener: (section?: HelpSection) => void) => Unsubscribe;
  /** Resolves once main has stored the setup and applied it (a moved sky included). */
  saveSetup: (setup: InstallSetup) => Promise<void>;
  updateNow: () => void;
  /** Stops the running download, keeping the files that finished; updateNow resumes it. */
  pauseSync: () => void;
  restartSky: () => void;
  showTestGrid: (on: boolean) => void;
  /** Resolves once the new code is stored and in the state. */
  rotateCode: () => Promise<void>;
  /** Hides this window, as the shortcut does, so a single screen shows the sky. */
  hide: () => void;
  quit: () => void;
};
