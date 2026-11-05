/** A path inside the site, under the configured `base` (`/home/` now, `/` after the root swap). */
export function sitePath(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}
