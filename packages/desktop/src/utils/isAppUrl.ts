import { APP_ORIGIN } from '../data/appOrigin.js';

/** True only for the app's own server, the one origin its windows may navigate to. */
export function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}
