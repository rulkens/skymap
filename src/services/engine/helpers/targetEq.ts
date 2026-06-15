/**
 * targetEq — value-equality on a FocusableTarget's IDENTITY fields only, used to
 * dedup slot writes (hover/select/focus setters skip the callback fan-out when
 * the incoming target names the same thing as the slot already holds). Identity,
 * not deep equality: two freshly-resolved GalaxyInfo objects for the same
 * (source, index) compare equal. Dispatch is table-driven via
 * TARGET_IDENTITY_KEY — equal iff the type-prefixed identity keys match.
 */
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { TARGET_IDENTITY_KEY } from './targetIdentityKey';

export function targetEq(a: FocusableTarget | null, b: FocusableTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return TARGET_IDENTITY_KEY[a.type](a) === TARGET_IDENTITY_KEY[b.type](b);
}
