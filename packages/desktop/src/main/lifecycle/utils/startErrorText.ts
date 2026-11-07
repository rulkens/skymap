import { APP_SERVER_PORT } from '../../../data/appServerPort';

/** Why Skymap could not start, in the README's words for the two causes a venue meets. */
export function startErrorText(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'EADDRINUSE') {
    return `Port ${APP_SERVER_PORT} is in use. Another copy of Skymap is running, or one was left behind after a crash: quit it, then start Skymap again.`;
  }
  if (code === 'ENOSPC') return 'The disk is full. Free some space, then start Skymap again.';
  return String(error);
}
