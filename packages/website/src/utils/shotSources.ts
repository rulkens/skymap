import { siteShot } from '../data/siteShot';
import type { ShotSources } from '../@types/ShotSources';

// `no-inline`: the smallest thumbnails are under Vite's inline limit and would land in the HTML as base64.
const FILES = import.meta.glob<string>('../assets/shots/*.{avif,webp}', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});

/**
 * The committed files of one shot as srcsets. The runner wrote them at the
 * manifest's widths, so nothing is resized at build; a width with no file
 * means `npm run site:shots` has not been run since the row changed.
 */
export function shotSources(id: string): ShotSources {
  const shot = siteShot(id);
  const url = (width: number, ext: string) => {
    const file = FILES[`../assets/shots/${id}-${width}.${ext}`];
    if (!file) throw new Error(`No ${ext} at ${width}px for shot "${id}": run npm run site:shots`);
    return file;
  };
  const srcset = (ext: string) =>
    shot.widths.map((width) => `${url(width, ext)} ${width}w`).join(', ');
  return {
    avif: srcset('avif'),
    webp: srcset('webp'),
    fallback: url(Math.min(...shot.widths), 'webp'),
    width: shot.settings?.crop?.width ?? shot.size.width,
    height: shot.settings?.crop?.height ?? shot.size.height,
  };
}
