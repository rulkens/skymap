import type { SplineConfig } from '../../../../../../src/@types/animation/SplineConfig';

/** Where the camera turns: after passing a waypoint, or before arriving at it. */
export const CURVE_OPTIONS = [
  { value: 'causalHermite', text: 'Head-on' },
  { value: 'centripetal', text: 'Early turn' },
];

/** What buildPathTrack flies with no spline authored. */
export const ABSENT_SPLINE: SplineConfig = { kind: 'centripetal' };
