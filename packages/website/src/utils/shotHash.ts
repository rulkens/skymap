import { composeHashParams } from '../../../../src/utils/url/composeHashParams';
import { encodeLayerSwitches } from '../../../../src/utils/url/encodeLayerSwitches';
import { parseHashParams } from '../../../../src/utils/url/parseHashParams';
import type { SiteShot } from '../@types/SiteShot';
import { shotLayerSwitches } from './shotLayerSwitches';

/**
 * The hash body (no `#`) the app opens for a shot: its `link` and a `layers=` of the switches its settings
 * make. The one reader of a shot's `link`: the site's address, the shot runner's URL and the press credits
 * all route through it, so they cannot disagree.
 */
export function shotHash(shot: Pick<SiteShot, 'link' | 'settings'>): string {
  const layers = encodeLayerSwitches(shotLayerSwitches(shot.settings ?? {}));
  if (layers === '') return shot.link;
  return composeHashParams(new Map([...parseHashParams(shot.link), ['layers', layers]]));
}
