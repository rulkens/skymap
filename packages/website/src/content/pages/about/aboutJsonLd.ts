import { BASE } from '../../../data/site';
import { MAKER_NAME } from '../../../data/siteIdentity';
import { makerProfile, whatIs } from './about.data';

/**
 * The About page's structured data: the maker as the same `Person` node Home
 * publishes (one `@id`), now with the page that describes them, and the page
 * itself as an `AboutPage` carrying the citable paragraph. Every value is
 * printed on the page. `site` is Astro's configured origin.
 */
export function aboutJsonLd(site: URL, pageUrl: string): Record<string, unknown>[] {
  const home = new URL(BASE, site).href;
  const maker = { '@id': `${home}#maker` };
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      ...maker,
      name: MAKER_NAME,
      url: pageUrl,
      sameAs: [makerProfile],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      url: pageUrl,
      name: 'About Skymap',
      description: whatIs,
      inLanguage: 'en-GB',
      about: { '@id': `${home}#app` },
      author: maker,
    },
  ];
}
