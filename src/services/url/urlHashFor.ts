/**
 * URL_HASH_FOR — table dispatch for the `#focus=<id>` URL body over the
 * FocusableTarget union, keyed on the union tag `t.type`.
 *
 * Each row returns the id segment for its arm, or null when the arm isn't link-encodable.
 * The `focus` row in `HASH_PARAM_SOURCES` calls this; `hashBodyFor` composes `focus=<id>`.
 */

import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../@types/engine/FocusableTargetType';
import { selectionToFocusId } from './focusUrl';
import { MILKY_WAY_FOCUS_ID } from './milkyWayFocusId';
import { BODY_FOCUS_PREFIX } from './bodyFocusId';
import { encodeStarFocusId } from './encodeStarFocusId';
import { encodeBlackHoleFocusId } from '../../layers/blackHoles/present/encodeBlackHoleFocusId';

export const URL_HASH_FOR: Record<FocusableTargetType, (t: FocusableTarget) => string | null> = {
  // Galaxy ids ride the codec's priority ladder (famous → PGC → SDSS objID → pos@).
  galaxyCatalog: (t) => (t.type === 'galaxyCatalog' ? selectionToFocusId(t) : null),
  // A structure's own id is already the stable `${category}-${seed}` token.
  structure: (t) => (t.type === 'structure' ? t.id : null),
  milkyWay: () => MILKY_WAY_FOCUS_ID,
  // The band has no position to fly to, so there is nothing for a `#focus=` hash to name.
  zoneOfAvoidance: () => null,
  // A bare `t.id` would collide with the famous-galaxy character class and mis-decode, so the
  // prefix is shared with `actionForRow` and the resolver. Craft and earthScene keep it too.
  body: (t) => (t.type === 'body' ? `${BODY_FOCUS_PREFIX}${t.id}` : null),
  craft: (t) => (t.type === 'craft' ? `${BODY_FOCUS_PREFIX}${t.id}` : null),
  earthScene: (t) => (t.type === 'earthScene' ? `${BODY_FOCUS_PREFIX}${t.id}` : null),
  // `star-<seedId>` for a seeded catalog, `star-<index>` for a survey star (`decodeStarFocusId`).
  starCatalog: (t) =>
    t.type === 'starCatalog'
      ? encodeStarFocusId({ type: 'starCatalog', source: t.source, index: t.index })
      : null,
  blackHole: (t) => (t.type === 'blackHole' ? encodeBlackHoleFocusId(t.id) : null),
};
