import pkg from '../../../../package.json';
import { APP_BASE } from './appLink';
import { BASE } from './site';
import { MAKER_NAME } from './siteIdentity';

/**
 * Home's structured data. Only what the page itself says or what is plainly
 * structural (free, open source under the licence in package.json, made by the
 * person the footer names): no rating, review, count or date, because none has
 * a row in facts.ts. `site` is Astro's configured origin.
 */
export function homeJsonLd(site: URL, description: string): Record<string, unknown>[] {
  const home = new URL(BASE, site).href;
  const maker = { '@id': `${home}#maker` };
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${home}#website`,
      url: home,
      name: 'skymap',
      description,
      inLanguage: 'en-GB',
      publisher: maker,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': `${home}#app`,
      name: 'skymap',
      url: new URL(APP_BASE, site).href,
      description,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires a browser with WebGPU.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      isAccessibleForFree: true,
      license: `https://opensource.org/licenses/${pkg.license}`,
      creator: maker,
    },
    { '@context': 'https://schema.org', '@type': 'Person', ...maker, name: MAKER_NAME },
  ];
}
