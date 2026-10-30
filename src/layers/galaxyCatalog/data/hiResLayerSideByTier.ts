import type { Tier } from '../../../@types/data/Tier';

/** Per-tier layer side of the hi-res array; cost line and ADR in `hiResLayerCount.ts`. */
export const HI_RES_LAYER_SIDE_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 512,
  medium: 1024,
  large: 1024,
} as const;
