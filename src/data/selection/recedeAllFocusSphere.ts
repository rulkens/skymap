import type { FocusSphere } from '../../@types/rendering/FocusSphere';

/**
 * A focus sphere nothing lies inside: centred a million Mpc out, far past the observable universe,
 * so it dims and unpicks every galaxy, star and disk the sphere test reaches. The focus subsystem
 * sends it for a `'subjectOnly'` region. The radii keep the smoothstep edges apart: equal edges
 * are undefined in WGSL.
 */
export const RECEDE_ALL_FOCUS_SPHERE: FocusSphere = {
  center: [1e6, 0, 0],
  apparentRadiusMpc: 1,
  physicalRadiusMpc: 0,
};
