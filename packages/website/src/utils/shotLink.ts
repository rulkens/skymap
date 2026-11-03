import { siteShot } from '../data/siteShot';
import { UNLINKABLE_LAYERS } from '../data/unlinkableLayers';

/**
 * The app link that opens what shot `id` shows, or none where the picture switches on a layer no link
 * can. The only reader of a shot's `link` for an address the site prints (tests/packages/website/shotLinks.test.ts).
 */
export function shotLink(id: string): string | undefined {
  const { link, settings = {} } = siteShot(id);
  return UNLINKABLE_LAYERS.some((key) => settings[key]) ? undefined : link;
}
