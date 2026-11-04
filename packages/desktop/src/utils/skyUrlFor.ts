import type { InstallSetup } from '../@types/InstallSetup.js';
import { APP_ORIGIN } from '../data/appOrigin.js';

/** The sky window's page: the dome projection or the flat kiosk view, both hosting the remote. */
export function skyUrlFor(mode: InstallSetup['mode']): string {
  return `${APP_ORIGIN}/${mode === 'dome' ? '?dome&remote' : '?remote'}`;
}
