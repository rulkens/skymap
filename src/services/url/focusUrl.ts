/**
 * Codec for the `#focus=<id>` URL hash that makes a galaxy selection
 * shareable.  Pure functions only — no DOM access, no React, no engine
 * coupling — so the codec is testable in isolation and reusable from
 * both the client mount path and tooling/tests.
 *
 * Why a hash, not a query string?  We host the app on Cloudflare
 * Workers Assets with a single static shell.  Query strings would force
 * the asset router to special-case `?focus=…` paths (or cause a 404
 * cache-poisoning footgun); the hash never reaches the server, so it's
 * pure-frontend with no infra changes.
 *
 * The id ladder (famous → sdss-/pgc- → pos@) lives in encodeGalaxyId.ts —
 * the one shared home for both galaxy encoders.
 */

import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import { encodeGalaxyId } from './encodeGalaxyId';

/**
 * Build the `#focus=<id>` payload (the bit after `=`) for the given
 * selection, or `null` when the row isn't link-encodable.  Delegates the
 * priority ladder to the shared encodeGalaxyId.
 */
export function selectionToFocusId(info: GalaxyInfo): string | null {
  return encodeGalaxyId({
    source: info.source,
    famousId: info.famous?.id ?? null,
    objId: info.objID,
    ra: info.ra,
    dec: info.dec,
  });
}
