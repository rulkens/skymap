import { getImage } from 'astro:assets';

import type { ShareImage } from '../@types/ShareImage';
import { siteShot } from '../data/siteShot';
// The site's own card (npm run site:shots); the app keeps its own at /og-image.jpg.
import cardUrl from '../assets/og-card.jpg?url';
import { shotSources } from './shotSources';

const WIDTH = 1200;

/** The link-preview picture of a page: the site card, or a shot of data/siteShots.ts cut to 1200 px wide as a JPEG, which previews read and a WebP they may not. */
export async function shareImage(id: string | undefined): Promise<ShareImage> {
  if (id === undefined) {
    return { src: cardUrl, width: WIDTH, height: 630, alt: siteShot('og-card').alt };
  }
  const { full, width, height } = shotSources(id);
  // The shot's widest file, a public file and no import: Astro reads it from the build, which holds public/
  // by then, and sizes the cut from the aspect of width and height alone.
  const image = await getImage({
    src: { src: full, width, height, format: 'webp' },
    format: 'jpg',
    width: WIDTH,
  });
  return {
    src: image.src,
    width: Number(image.attributes.width),
    height: Number(image.attributes.height),
    alt: siteShot(id).alt,
  };
}
