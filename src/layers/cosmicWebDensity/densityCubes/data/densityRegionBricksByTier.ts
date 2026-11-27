import type { Tier } from '../../../../../packages/shared/src/@types/data/Tier';

// Bricks per axis of a field's detail region (K): 240³ texels at 5, 384³ at 8 (spec §9). Small and
// medium share K so a switch between them keeps the region and its bricks.
export const DENSITY_REGION_BRICKS_BY_TIER = {
  small: 5,
  medium: 5,
  large: 8,
} as const satisfies Record<Tier, number>;
