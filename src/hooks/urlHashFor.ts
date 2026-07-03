/**
 * URL_HASH_FOR — table dispatch for the `#focus=<id>` URL body over the
 * FocusableTarget union, keyed on the union tag `t.type`.
 *
 * Each row owns one focusable arm: it narrows the target via `t.type` (no
 * cast) and returns the id segment for that arm, or null when the row isn't
 * link-encodable (a Synthetic galaxy has no durable cross-rebuild identity).
 * `computeDesiredHash` wraps a non-null id as `focus=<id>`.
 *
 * Dispatching on `t.type` through a `Record<FocusableTargetType, …>` table
 * follows the simplicity convention's table-dispatch rule (item 7): a new
 * focusable kind adds one row here instead of growing a predicate chain the
 * codec has to keep in lockstep.
 */

import type { FocusableTarget } from '../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../@types/engine/FocusableTargetType';
import { selectionToFocusId } from '../services/url/focusUrl';
import { MILKY_WAY_FOCUS_ID } from '../services/url/milkyWayFocusId';

export const URL_HASH_FOR: Record<FocusableTargetType, (t: FocusableTarget) => string | null> = {
  // Galaxy ids ride the codec's priority ladder (famous → PGC → SDSS objID →
  // pos@) and are null for non-encodable rows (e.g. Synthetic).
  galaxyCatalog: (t) => (t.type === 'galaxyCatalog' ? selectionToFocusId(t) : null),
  // A structure's own id is already the stable `${category}-${seed}` token.
  structure: (t) => (t.type === 'structure' ? t.id : null),
  // Milky Way singleton → the fixed deep-link literal; resolveFocusId decodes
  // it back to `{ type: 'milkyWay' }`, closing the `#focus=milkyWay` round-trip.
  milkyWay: () => MILKY_WAY_FOCUS_ID,
};
