import { FOREGROUND_MAX_DISTANCE_MPC } from '../rendering/foregroundMaxDistance';

// Near-field content yields at the foreground gate BY IMPORT: the fade starts half a gate
// out, where every seeded star, trail and craft is already far below a pixel, so the edge
// lands on nothing visible. A Layer entry declaring it lets core skip the pass at zero.
export const FOREGROUND_RECEDE = {
  out: [FOREGROUND_MAX_DISTANCE_MPC / 2, FOREGROUND_MAX_DISTANCE_MPC],
} as const;
