/**
 * Pure codec for the `#focus=<id>` URL hash that makes a galaxy selection
 * shareable. A hash, not a query string: the hash never reaches Cloudflare
 * Workers Assets, so no router special-case or cache-poisoning footgun.
 * The id ladder lives in encodeGalaxyId.ts.
 */

import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import { encodeGalaxyId } from './encodeGalaxyId';

/**
 * Build the `#focus=<id>` payload (the bit after `=`) for the given
 * selection.  Delegates the priority ladder to the shared encodeGalaxyId.
 */
export function selectionToFocusId(info: GalaxyInfo): string {
  return encodeGalaxyId({
    source: info.source,
    famousId: info.famous?.id ?? null,
    objId: info.objID,
    ra: info.ra,
    dec: info.dec,
    distMpc: info.distanceMpc,
  });
}
