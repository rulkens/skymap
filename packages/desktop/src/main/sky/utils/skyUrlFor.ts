import type { InstallMode } from '../../../@types/InstallMode';
import { APP_ORIGIN } from '../../server/data/appOrigin';

/** The sky window's page: the dome projection or the flat kiosk view, both hosting the remote. */
export function skyUrlFor(mode: InstallMode): string {
  return `${APP_ORIGIN}/${mode === 'dome' ? '?dome&remote' : '?remote'}`;
}
