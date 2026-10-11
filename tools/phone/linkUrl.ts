import type { ShotLink } from '../shot/@types/ShotLink';

/** The deep link on the server the phone talks to; the link's own origin was dropped by parseShotLink. */
export function linkUrl(origin: string, link: ShotLink): string {
  return `${origin}/${link.search === '' ? '' : `?${link.search}`}${link.hash === '' ? '' : `#${link.hash}`}`;
}
