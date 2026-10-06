import type { IconName } from '../@types/IconName';
import { FOOTER_GROUPS } from '../data/nav';

// Every page of the site with its icon, deepest path first, so `/docs/cite/` is found before `/docs/`.
const PAGES = FOOTER_GROUPS.flatMap((group) => group.items).sort((a, b) => b.path.length - a.path.length);

/**
 * The drawing a ring link carries, from where it goes: a page of the site has
 * that page's icon, the repository's host has the code icon, any other site has
 * the mark of a link that leaves. A jump within the page and a file have none,
 * and keep the plain marker. `base` is the site's base path (`/home/` in preview).
 */
export function linkIcon(href: string, base: string): IconName | undefined {
  if (href.startsWith('#')) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return new URL(href).hostname === 'github.com' ? 'code' : 'outbound';
  }
  const root = base.replace(/\/$/, '');
  if (!href.startsWith(`${root}/`)) return undefined;
  const path = href.slice(root.length).split('#')[0]!;
  return PAGES.find((page) => (page.path === '/' ? path === '/' : path.startsWith(page.path)))?.icon;
}
