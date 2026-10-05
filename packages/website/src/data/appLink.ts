/** The only place the app's base path is written; the `/app` move changes this line. */
export const APP_BASE = '/';

/** Root-absolute URL of the app, with an optional deep-link hash (`focus=body-earth`, no leading `#`). */
export function appLink(hash?: string): string {
  return hash ? `${APP_BASE}#${hash}` : APP_BASE;
}
