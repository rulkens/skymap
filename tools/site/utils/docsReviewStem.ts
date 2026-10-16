/**
 * The file stem of a page's review (`/docs/start/scene/` → `docs-start-scene`, `/` → `index`),
 * or null for a path that is not made of plain path characters. The page comes off a query
 * string and becomes a file name, so only path characters pass and `..` never does.
 */
export function docsReviewStem(page: string): string | null {
  if (!/^\/[A-Za-z0-9._/-]*$/.test(page) || page.includes('..')) return null;
  return page.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'index';
}
