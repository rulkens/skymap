/**
 * HII_TIERS — each HII sub-tier's TOOL-ONLY lanes (timing/segment label,
 * render-bag divisor key), in the shared draw/composite/HUD order. Membership
 * and order come from `src/data/hiiTiers.ts`, which the shared field renderer
 * loops over too, so the two orders cannot drift.
 */
import type { HiiTier } from '../../../../src/layers/milkyWay/field/starFormation/@types/HiiTier';
import type { HiiTierSpec } from '../../@types/engine/HiiTierSpec';
import { HII_TIER_KINDS } from '../../../../src/layers/milkyWay/field/starFormation/data/hiiTiers';

const TIER_LANES: Record<HiiTier, Omit<HiiTierSpec, 'kind'>> = {
  shells: { label: 'hii:shells', divisorKey: 'shellsDivisor' },
  young: { label: 'hii:young', divisorKey: 'youngDivisor' },
  dig: { label: 'hii:dig', divisorKey: 'digDivisor' },
};

export const HII_TIERS: readonly HiiTierSpec[] = HII_TIER_KINDS.map((kind) => ({
  kind,
  ...TIER_LANES[kind],
}));
