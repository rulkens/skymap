import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

import type { FlightStill } from '../@types/FlightStill';
import type { FlightStillSources } from '../@types/FlightStillSources';

// Cut by `npm run site:media`, one pair per stop id.
const FILES = import.meta.glob<{ default: ImageMetadata }>('../assets/flight/*.avif', {
  eager: true,
});

// The committed file is the large candidate, served untouched; the small one
// and the WebP fallbacks are derived at build. `sizes` is the width a still
// really has once it covers a full-height stage, which is wider than the screen
// whenever the screen is narrower than the picture's shape.
const SHAPES = {
  portrait: { small: 480, sizes: 'max(100vw, 56.25vh)' },
  landscape: { small: 960, sizes: 'max(100vw, 177.78vh)' },
} as const;

/** Responsive sources for each flight stop's stills; a stop with no committed still fails the build. */
export async function flightStills(ids: readonly string[]): Promise<FlightStill[]> {
  const sources = async (id: string, shape: keyof typeof SHAPES): Promise<FlightStillSources> => {
    const file = FILES[`../assets/flight/${id}-${shape}.avif`]?.default;
    if (!file) throw new Error(`No ${shape} still for flight stop "${id}": run npm run site:media`);
    const { small, sizes } = SHAPES[shape];
    const [avifSmall, webpSmall, webpFull] = await Promise.all([
      getImage({ src: file, width: small, format: 'avif', quality: 50 }),
      getImage({ src: file, width: small, format: 'webp', quality: 72 }),
      getImage({ src: file, width: file.width, format: 'webp', quality: 72 }),
    ]);
    return {
      avif: `${avifSmall.src} ${small}w, ${file.src} ${file.width}w`,
      webp: `${webpSmall.src} ${small}w, ${webpFull.src} ${file.width}w`,
      sizes,
      src: webpFull.src,
      width: file.width,
      height: file.height,
    };
  };
  return Promise.all(
    ids.map(async (id) => ({
      portrait: await sources(id, 'portrait'),
      landscape: await sources(id, 'landscape'),
    })),
  );
}
