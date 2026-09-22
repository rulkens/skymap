/**
 * URL_HASH_FOR — table dispatch for the `#focus=<id>` URL body over the
 * FocusableTarget union, keyed on the union tag `t.type`.
 *
 * Each row owns one focusable arm: it narrows the target via `t.type` (no
 * cast) and returns the id segment for that arm, or null when the arm isn't
 * link-encodable (the zone-of-avoidance band has no position to fly to).
 * The `focus` row in `HASH_PARAM_SOURCES` calls this, and `hashBodyFor` composes
 * a non-null id into the body as `focus=<id>`.
 *
 * Dispatching on `t.type` through a `Record<FocusableTargetType, …>` table
 * follows the simplicity convention's table-dispatch rule (item 7): a new
 * focusable kind adds one row here instead of growing a predicate chain the
 * codec has to keep in lockstep.
 */

import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../@types/engine/FocusableTargetType';
import { selectionToFocusId } from './focusUrl';
import { MILKY_WAY_FOCUS_ID } from './milkyWayFocusId';
import { BODY_FOCUS_PREFIX } from './bodyFocusId';
import { encodeStarFocusId } from './encodeStarFocusId';

export const URL_HASH_FOR: Record<FocusableTargetType, (t: FocusableTarget) => string | null> = {
  // Galaxy ids ride the codec's priority ladder (famous → PGC → SDSS objID → pos@).
  galaxyCatalog: (t) => (t.type === 'galaxyCatalog' ? selectionToFocusId(t) : null),
  // A structure's own id is already the stable `${category}-${seed}` token.
  structure: (t) => (t.type === 'structure' ? t.id : null),
  // Milky Way singleton → the fixed deep-link literal; the resolver's
  // resolveFocusId decodes it back to `{ type: 'milkyWay' }`, closing the
  // `#focus=milkyWay` round-trip.
  milkyWay: () => MILKY_WAY_FOCUS_ID,
  // No deep link: the band has no position to fly to (spec's Non-goals), so
  // there is nothing for a `#focus=` hash to name.
  zoneOfAvoidance: () => null,
  // Scene body (a planet, Earth, a mesh body) → its seed id under the shared
  // BODY_FOCUS_PREFIX (`body-earth`). The same
  // prefix `actionForRow` and the resolver's focusIdOf emit, and its
  // resolveFocusId strips, closing the `#focus=body-<id>` round-trip. A bare
  // `t.id` would collide with the famous-galaxy character class and mis-decode.
  body: (t) => (t.type === 'body' ? `${BODY_FOCUS_PREFIX}${t.id}` : null),
  // A star's id is `star-<seedId>` for a seeded catalog and `star-<index>` for a
  // survey star; `decodeStarFocusId` splits the two apart again, closing the
  // round-trip.
  starCatalog: (t) =>
    t.type === 'starCatalog'
      ? encodeStarFocusId({ type: 'starCatalog', source: t.source, index: t.index })
      : null,
};
