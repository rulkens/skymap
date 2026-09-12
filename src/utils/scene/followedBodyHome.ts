import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { HomeFocusTarget } from '../../@types/engine/HomeFocusTarget';
import { bodyFollowsSimClock } from './bodyFollowsSimClock';

/**
 * followedBodyHome — the `HomeFocusTarget` for a body-arm ref; throws if the
 * sim clock does not move the body (home must be a body the follow driver tracks).
 */
export function followedBodyHome(ref: Extract<SelectionRef, { type: 'body' }>): HomeFocusTarget {
  if (!bodyFollowsSimClock(ref.id)) {
    throw new Error(`followedBodyHome: '${ref.id}' is static; the follow driver cannot track it`);
  }
  return { ref };
}
