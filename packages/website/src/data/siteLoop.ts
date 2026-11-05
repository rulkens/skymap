import { SITE_LOOPS } from './siteLoops';
import type { SiteLoop } from '../@types/SiteLoop';

/** Look a loop up by id; an unknown id throws, so a page that shows a missing film fails the build. */
export function siteLoop(id: string): SiteLoop {
  const row = SITE_LOOPS.find((loop) => loop.id === id);
  if (!row) throw new Error(`Unknown loop id "${id}" (see src/data/siteLoops.ts)`);
  return row;
}
