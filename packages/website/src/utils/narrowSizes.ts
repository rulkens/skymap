import { MEDIA } from '../data/media.ts';

/** An image's `sizes`: how wide it is drawn up to the layout break (MEDIA.narrow), then above it (one width or the rest of a longer list). */
export function narrowSizes(narrow: string, wide: string): string {
  return `${MEDIA.narrow} ${narrow}, ${wide}`;
}
