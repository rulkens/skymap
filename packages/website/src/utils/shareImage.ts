import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

import type { ShareImage } from '../@types/ShareImage';
import { siteShot } from '../data/siteShot';
// The site's own card (npm run site:shots); the app keeps its own at /og-image.jpg.
import cardUrl from '../assets/og-card.jpg?url';

// Lazy, so only the shot a page names is processed.
const FILES = import.meta.glob<{ default: ImageMetadata }>('../assets/shots/*.webp');
const WIDTH = 1200;

/** The link-preview picture of a page: the site card, or a shot of data/siteShots.ts cut to 1200 px wide as a JPEG, which previews read and a WebP they may not. */
export async function shareImage(id: string | undefined): Promise<ShareImage> {
  if (id === undefined) {
    return { src: cardUrl, width: WIDTH, height: 630, alt: siteShot('og-card').alt };
  }
  const shot = siteShot(id);
  const widest = `../assets/shots/${id}-${Math.max(...shot.widths)}.webp`;
  const load = FILES[widest];
  if (!load) throw new Error(`No file for shot "${id}": run npm run site:shots`);
  const image = await getImage({ src: (await load()).default, format: 'jpg', width: WIDTH });
  return {
    src: image.src,
    width: Number(image.attributes.width),
    height: Number(image.attributes.height),
    alt: shot.alt,
  };
}
