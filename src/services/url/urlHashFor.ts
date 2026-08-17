/**
 * URL_HASH_FOR — table dispatch for the `#focus=<id>` URL body over the
 * FocusableTarget union, keyed on the union tag `t.type`.
 *
 * Each row owns one focusable arm: it narrows the target via `t.type` (no
 * cast) and returns the id segment for that arm, or null when the row isn't
 * link-encodable (a Synthetic galaxy has no durable cross-rebuild identity).
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
import { STAR_FOCUS_PREFIX } from './starFocusId';

export const URL_HASH_FOR: Record<FocusableTargetType, (t: FocusableTarget) => string | null> = {
  // Galaxy ids ride the codec's priority ladder (famous → PGC → SDSS objID →
  // pos@) and are null for non-encodable rows (e.g. Synthetic).
  galaxyCatalog: (t) => (t.type === 'galaxyCatalog' ? selectionToFocusId(t) : null),
  // A structure's own id is already the stable `${category}-${seed}` token.
  structure: (t) => (t.type === 'structure' ? t.id : null),
  // Milky Way singleton → the fixed deep-link literal; resolveFocusId decodes
  // it back to `{ type: 'milkyWay' }`, closing the `#focus=milkyWay` round-trip.
  milkyWay: () => MILKY_WAY_FOCUS_ID,
  // No deep link: the band has no position to fly to (spec's Non-goals), so
  // there is nothing for a `#focus=` hash to name.
  zoneOfAvoidance: () => null,
  // Scene body (any SCENE_BODIES entry — famous star, planet, or Earth) →
  // its seed id under the shared BODY_FOCUS_PREFIX (`body-sirius`). The same
  // prefix the sibling encoders (focusIdOf, focusIdForRow) emit and
  // resolveFocusId strips, closing the `#focus=body-<id>` round-trip. A bare
  // `t.id` would collide with the famous-galaxy character class and mis-decode.
  body: (t) => (t.type === 'body' ? `${BODY_FOCUS_PREFIX}${t.id}` : null),
  // A survey star's id is the `star-<index>` token; resolveFocusId strips the
  // prefix back to the record index, closing the `#focus=star-<index>` round-trip.
  star: (t) => (t.type === 'star' ? `${STAR_FOCUS_PREFIX}${t.index}` : null),
};
