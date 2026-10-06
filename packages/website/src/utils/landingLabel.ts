import { FOOTER_GROUPS } from '../data/nav';

/** What a link up to a landing page says: the page's name in the footer, and for Home, which the footer names by its reader, the site's. */
export function landingLabel(path: string): string {
  if (path === '/') return 'skymap home page';
  const item = FOOTER_GROUPS.flatMap((group) => group.items).find((row) => row.path === path);
  if (!item) throw new Error(`No page at "${path}" in src/data/nav.ts`);
  return item.label;
}
