/**
 * The three HII sub-tiers that each get their own render target, divisor and
 * timing slot (`docs/research/milky-way/hii-regions.md`). This file owns their
 * ORDER — draw, composite and HUD order all follow it — and, through
 * `mapHiiTiers`, their MEMBERSHIP: a fourth `HiiTier` fails to compile there
 * rather than silently dropping out of every per-tier loop. Any host table
 * carrying its own per-tier lanes (labels, divisor keys) orders its rows off
 * `HII_TIER_KINDS` rather than repeating the sequence.
 */
import type { HiiTier } from '../@types/galaxy/HiiTier';

export const HII_TIER_KINDS: readonly HiiTier[] = ['shells', 'young', 'dig'];

/**
 * One value per tier, built by an exhaustive object literal — the typed
 * replacement for `Object.fromEntries(...) as Record<HiiTier, T>`, which
 * type-checks a missing tier as present.
 */
export function mapHiiTiers<T>(build: (kind: HiiTier) => T): Record<HiiTier, T> {
  return { shells: build('shells'), young: build('young'), dig: build('dig') };
}
