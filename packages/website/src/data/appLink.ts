/** The only place the app's base path is written; the `/app` move changes this line. */
export const APP_BASE = '/';

/**
 * Root-absolute URL of the app, with an optional deep-link hash (`focus=body-earth`,
 * no leading `#`) and an optional query flag (`dome`), which the app reads before the hash.
 */
export function appLink(hash?: string, query?: string): string {
  return `${APP_BASE}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}
