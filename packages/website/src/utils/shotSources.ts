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
 * `shadow` gives a `shadow` row's multiply layer, written beside its cut-out.
 */
export function shotSources(id: string, shadow = false): ShotSources {
  const shot = siteShot(id);
  const name = shadow ? `${id}-shadow` : id;
  const url = (width: number, ext: string) => {
    const file = FILES[`../assets/shots/${name}-${width}.${ext}`];
    if (!file)
      throw new Error(`No ${ext} at ${width}px for shot "${name}": run npm run site:shots`);
    return file;
  };
  const srcset = (ext: string) =>
    shot.widths.map((width) => `${url(width, ext)} ${width}w`).join(', ');
  return {
    avif: srcset('avif'),
    webp: srcset('webp'),
    fallback: url(Math.min(...shot.widths), 'webp'),
    full: url(Math.max(...shot.widths), 'webp'),
    width: shot.settings?.crop?.width ?? shot.size.width,
    height: shot.settings?.crop?.height ?? shot.size.height,
  };
}
