import type { Tier } from '../../../../../packages/shared/src/@types/data/Tier';

// Level 1 is the half-resolution cube, level 2 the quarter. Medium and large share level 1 so a
// switch between them reloads nothing.
export const DENSITY_BASE_LEVEL_BY_TIER = {
  small: 2,
  medium: 1,
  large: 1,
} as const satisfies Record<Tier, 1 | 2>;
