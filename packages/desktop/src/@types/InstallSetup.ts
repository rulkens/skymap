import type { DataUpdates } from './DataUpdates';

/** `<userData>/setup.json`. */
export type InstallSetup = {
  mode: 'dome' | 'kiosk';
  /** null → the primary display. */
  display: { id: number; width: number; height: number } | null;
  /** Interface name for the pairing address; null → the first LAN IPv4. */
  network: string | null;
  autostart: boolean;
  dataUpdates: DataUpdates;
};
