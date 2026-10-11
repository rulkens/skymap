import { sitePath } from './sitePath';

/**
 * A page's place under Home as schema.org `BreadcrumbList`. `trail` is the
 * pages below Home in order, each a name and a site path; `site` is Astro's
 * configured origin.
 */
export function breadcrumbJsonLd(
  site: URL,
  trail: readonly { name: string; path: string }[],
): Record<string, unknown> {
  const items = [{ name: 'skymap', path: '/' }, ...trail];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: new URL(sitePath(item.path), site).href,
    })),
  };
}
