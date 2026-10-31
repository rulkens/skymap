/** The only place the app's base path is written; the `/app` move changes this line. */
export const APP_BASE = '/';

/** The launch control's words (components/shared/links/OpenApp/OpenApp.tsx), for copy that quotes them. */
export const OPEN_APP_LABEL = 'Open app';

// The site's dev server has no app beside it, so there its links open the live app; builds and tests stay root-absolute.
const APP_ORIGIN = import.meta.env.MODE === 'development' ? String(import.meta.env.SITE).replace(/\/$/, '') : '';

/**
 * Root-absolute URL of the app (absolute to the live site on the dev server), with an optional
 * deep-link hash (`focus=body-earth`, no leading `#`) and an optional query flag (`dome`), which
 * the app reads before the hash.
 */
export function appLink(hash?: string, query?: string): string {
  return `${APP_ORIGIN}${APP_BASE}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}
