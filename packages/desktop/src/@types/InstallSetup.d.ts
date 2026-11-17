import type { DataUpdates } from './DataUpdates';
import type { DisplayInfo } from './DisplayInfo';
import type { InstallMode } from './InstallMode';

/** The `setup` key of `<userData>/settings.json`. */
export type InstallSetup = {
  mode: InstallMode;
  /** null → the primary display. */
  display: Pick<DisplayInfo, 'id' | 'width' | 'height'> | null;
  /** Interface name for the pairing address; null → the first LAN IPv4. */
  network: string | null;
  autostart: boolean;
  dataUpdates: DataUpdates;
};
