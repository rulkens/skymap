import { getImage } from 'astro:assets';

import poster from '../assets/poster-earth.webp';
import type { HeroPoster } from '../@types/HeroPoster';

const WIDTHS = [960, 1440, 1920];

export async function heroPoster(): Promise<HeroPoster> {
  const variants = await Promise.all(
    WIDTHS.map((width) => getImage({ src: poster, width, format: 'webp', quality: 78 })),
  );
  return {
    src: variants[variants.length - 1].src,
    srcset: variants.map((v, i) => `${v.src} ${WIDTHS[i]}w`).join(', '),
    sizes: '100vw',
    width: poster.width,
    height: poster.height,
  };
}
