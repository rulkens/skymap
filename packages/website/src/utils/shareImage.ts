import type { ShareImage } from '../@types/ShareImage';
import { SHARE_CARD_SIZE } from '../data/shareCardSize';
import { SHARE_CARDS } from '../data/shareCards';
import { siteShot } from '../data/siteShot';
// The site's card (npm run site:shots); the app has its own copy at /og-image.jpg.
import siteCardUrl from '../assets/og-card.jpg?url';
import { pageLabel } from './pageLabel';
import { shareCardFile } from './shareCardFile';
import { sitePath } from './sitePath';

const PAGE_CARDS = import.meta.glob<string>('../assets/cards/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** The link-preview card of the page at `pathname` (Astro.url's, under the base): a landing page's own, else the site's. */
export function shareImage(pathname: string): ShareImage {
  const card = SHARE_CARDS.find((entry) => sitePath(entry.path) === pathname);
  if (!card) return { src: siteCardUrl, ...SHARE_CARD_SIZE, alt: siteShot('og-card').alt };
  const src = PAGE_CARDS[`../assets/cards/${shareCardFile(card.path)}`];
  if (!src) throw new Error(`No share card for ${card.path}: run npm run site:shots`);
  return {
    src,
    ...SHARE_CARD_SIZE,
    alt: `${siteShot(card.shot).alt} Over it, the Skymap logo and the words ${pageLabel(card.path)}.`,
  };
}
