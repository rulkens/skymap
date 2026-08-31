/**
 * HiiTierSpec — one row of `data/hiiTiers.ts`'s `HII_TIERS`, the table that
 * drives the per-tier target, divisor, bind group, header and timing slot
 * `createGalaxyEngine.ts`'s `drawFrame` builds for shells/dig/young instead
 * of copy-pasting DIG's split two more times.
 */
import type { HiiTier } from '../../../../src/@types/galaxy/HiiTier';
import type { RenderSettings } from './RenderSettings';

export type HiiTierSpec = {
  readonly kind: HiiTier;
  /**
   * `model.hiiSegments`' own label for this tier (`hiiRegions.ts`'s
   * `buildHiiRegionsWithSegments`) — restated here, not imported, since that
   * function returns plain string literals with no exported constant. Also
   * this tier's GPU-timing slot name (`timingSlots.ts`): one string serves
   * both, since a pass and the segment it draws are the same span.
   */
  readonly label: string;
  /** Which `RenderSettings` lane sizes this tier's own reduced target. */
  readonly divisorKey: keyof Pick<RenderSettings, 'shellsDivisor' | 'digDivisor' | 'youngDivisor'>;
};
