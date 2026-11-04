import type { InstallSetup } from '../@types/InstallSetup.js';
import { APP_SERVER_PORT } from '../data/appServerPort.js';

/** The sky window's page: the dome projection or the flat kiosk view, both hosting the remote. */
export function skyUrlFor(mode: InstallSetup['mode']): string {
  return `https://localhost:${APP_SERVER_PORT}/${mode === 'dome' ? '?dome&remote' : '?remote'}`;
}
