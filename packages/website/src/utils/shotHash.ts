import type { SiteShot } from '../@types/SiteShot';

/**
 * The hash body (no `#`) the app opens for a shot. The one reader of a shot's `link`: the site's
 * address, the shot runner's URL and the press credits all route through it, so they cannot disagree.
 */
export function shotHash(shot: Pick<SiteShot, 'link' | 'settings'>): string {
  return shot.link;
}
