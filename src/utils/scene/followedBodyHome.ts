import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { HomeFocusTarget } from '../../@types/engine/HomeFocusTarget';
import { bodyFollowsSimClock } from './bodyFollowsSimClock';

/**
 * followedBodyHome — the `HomeFocusTarget` for a body-arm ref; throws if the
 * body has no `ORBITAL_ELEMENTS` row (home must be a body the follow driver tracks).
 */
export function followedBodyHome(ref: Extract<SelectionRef, { type: 'body' }>): HomeFocusTarget {
  if (!bodyFollowsSimClock(ref.id)) {
    throw new Error(`followedBodyHome: '${ref.id}' has no ORBITAL_ELEMENTS row to follow`);
  }
  return { ref };
}
