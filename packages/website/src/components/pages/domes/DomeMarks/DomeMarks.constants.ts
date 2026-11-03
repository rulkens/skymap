import { DOME_TILT_DEG } from '../../../../content/pages/domes/domes.data.ts';

// The focus is the tilt away from the zenith, and the rim is 90 degrees from it.
export const FOCUS_SHARE = DOME_TILT_DEG / 90;
export const FOCUS_HEIGHT_DEG = 90 - DOME_TILT_DEG;
export const R = 100;
// A tick every ten degrees of height, from the horizon (the rim) to the zenith; every thirty degrees is longer.
export const TICKS_PATH = Array.from({ length: 9 }, (_, i) => {
  const height = i * 10;
  const x = R - (R * (90 - height)) / 90;
  const half = height % 30 === 0 ? 4 : 2;
  return `M${x} ${R - half}v${2 * half}`;
}).join('');
