import { APP_SERVER_PORT } from '../data/appServerPort.js';

/** True only for the app's own server, the one origin its windows may navigate to. */
export function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === `https://localhost:${APP_SERVER_PORT}`;
  } catch {
    return false;
  }
}
