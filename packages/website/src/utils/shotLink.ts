import { siteShot } from '../data/siteShot';
import { UNLINKABLE_LAYERS } from '../data/unlinkableLayers';
import { shotHash } from './shotHash';

/**
 * The app link that opens what shot `id` shows, or none where the picture switches on a layer no link
 * can. Reads the address through shotHash, the one reader of a shot's `link` (tests/packages/website/shotLinks.test.ts).
 */
export function shotLink(id: string): string | undefined {
  const shot = siteShot(id);
  const settings = shot.settings ?? {};
  return UNLINKABLE_LAYERS.some((key) => settings[key]) ? undefined : shotHash(shot);
}
