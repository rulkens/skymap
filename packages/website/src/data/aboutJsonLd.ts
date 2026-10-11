import { BASE } from './site';
import { MAKER_NAME, REPO_URL } from './siteIdentity';

/**
 * The About page's structured data: the maker as the same `Person` node Home
 * publishes (one `@id`), now with the page that describes them, and the page
 * itself as an `AboutPage` carrying the citable paragraph. Every value is
 * printed on the page. `site` is Astro's configured origin.
 */
export function aboutJsonLd(site: URL, pageUrl: string, whatIs: string): Record<string, unknown>[] {
  const home = new URL(BASE, site).href;
  const maker = { '@id': `${home}#maker` };
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      ...maker,
      name: MAKER_NAME,
      url: pageUrl,
      sameAs: [REPO_URL.slice(0, REPO_URL.lastIndexOf('/'))],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      url: pageUrl,
      name: 'About skymap',
      description: whatIs,
      inLanguage: 'en-GB',
      about: { '@id': `${home}#app` },
      author: maker,
    },
  ];
}
