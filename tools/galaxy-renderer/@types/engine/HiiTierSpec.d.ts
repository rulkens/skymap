/**
 * HiiTierSpec — one row of `data/hiiTiers.ts`'s `HII_TIERS`: which render-bag
 * divisor sizes each HII tier's own reduced target in the tool.
 */
import type { HiiTier } from '../../../../src/layers/milkyWay/field/starFormation/@types/HiiTier';
import type { RenderSettings } from './RenderSettings';

export type HiiTierSpec = {
  readonly kind: HiiTier;
  /** Which `RenderSettings` lane sizes this tier's own reduced target. */
  readonly divisorKey: keyof Pick<RenderSettings, 'shellsDivisor' | 'digDivisor' | 'youngDivisor'>;
};
