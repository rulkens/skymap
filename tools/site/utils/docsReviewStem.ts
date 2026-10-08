/**
 * The file stem of a docs page's review (`/docs/start/scene/` → `docs-start-scene`),
 * or null for anything that is not a docs path. The page comes off a query string and
 * becomes a file name, so only path characters pass and `..` never does.
 */
export function docsReviewStem(page: string): string | null {
  if (!/^\/docs\/[A-Za-z0-9._/-]*$/.test(page) || page.includes('..')) return null;
  return page.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
}
