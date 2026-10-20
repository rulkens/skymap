import type { FadeIdentity } from '../../@types/animation/FadeIdentity';

/** A fade identity as one string: its scoped address, or the bare one for an item-less entry. */
export function fadeIdentityKey(id: FadeIdentity): string {
  return id.item === undefined ? id.address : `${id.address}:${id.item}`;
}
