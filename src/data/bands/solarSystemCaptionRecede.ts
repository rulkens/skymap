import { regionById } from '../../utils/regions/regionById';

// Four neighbourhood extents: past the farthest seeded star, where every body these captions
// name is long sub-pixel. Measured from the Sun, so a caption fades with the eye's distance from
// what it names, not from wherever the camera happens to orbit; half the reach is the taste knob.
const GONE_MPC = regionById('solar-neighbourhood').extentMpc * 4;

export const SOLAR_SYSTEM_CAPTION_RECEDE = {
  from: 'solar-system',
  out: [GONE_MPC / 2, GONE_MPC],
} as const;
