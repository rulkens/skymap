import type { SiteShot } from '../@types/SiteShot';

// A cut narrower than this is already near the app's own size in the text column.
const WIDE_FROM_PX = 700;

/**
 * Whether a docs page sets a shot wider than its text column unless the page
 * says otherwise: a picture of the app's interface is read, not looked at, and
 * its text is 11 to 13 px in a frame 1200 px wide.
 */
export function docFigureWide(shot: SiteShot): boolean {
  const frame = shot.settings?.crop?.width ?? shot.size.width;
  return shot.settings?.ui === true && frame >= WIDE_FROM_PX;
}
