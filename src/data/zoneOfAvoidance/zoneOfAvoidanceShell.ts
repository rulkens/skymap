/**
 * ZONE_OF_AVOIDANCE_SHELL — the guide band's shape. Visual-pass
 * placeholders, Mpc / degrees. The renderer, not this file, converts the
 * radial span into an e-folding length; see `writeUniforms`.
 */
import type { ZoneOfAvoidanceShell } from '../../@types/rendering/ZoneOfAvoidanceShell';

export const ZONE_OF_AVOIDANCE_SHELL: ZoneOfAvoidanceShell = {
  innerRadiusMpc: 3,
  outerRadiusMpc: 380,
  bulgeDeg: 10,
  anticenterDeg: 3,
};
