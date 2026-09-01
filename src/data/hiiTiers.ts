/**
 * The three HII sub-tiers' single source of truth for ORDER (draw/composite/
 * HUD follow it) and, via `mapHiiTiers`, MEMBERSHIP (a missing tier fails to compile).
 */
import type { HiiTier } from '../@types/galaxy/HiiTier';

export const HII_TIER_KINDS: readonly HiiTier[] = ['shells', 'young', 'dig'];

/** One value per tier, via an exhaustive literal — a missing tier fails to compile. */
export function mapHiiTiers<T>(build: (kind: HiiTier) => T): Record<HiiTier, T> {
  return { shells: build('shells'), young: build('young'), dig: build('dig') };
}
