import type { Tier } from '../../../../../packages/shared/src/@types/data/Tier';

/** March steps per ray for the density cubes' raymarch; `small` halves them for phones. */
export const DENSITY_MARCH_STEPS_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 64,
  medium: 128,
  large: 128,
};
