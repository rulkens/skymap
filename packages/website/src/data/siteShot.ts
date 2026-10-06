import { SITE_SHOTS } from './siteShots';
import type { SiteShot } from '../@types/SiteShot';

/** Look a shot up by id; an unknown id throws, so a page that shows a missing picture fails the build. */
export function siteShot(id: string): SiteShot {
  const row = SITE_SHOTS.find((s) => s.id === id);
  if (!row) throw new Error(`Unknown shot id "${id}" (see src/data/siteShots.ts)`);
  return row;
}
