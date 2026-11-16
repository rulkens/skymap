/**
 * moonAlbedoRecipe — the LROC WAC de-light and grade. WAC's Sun stands over the
 * equator ~72° of longitude away, east of each point west of −90°, west of it
 * elsewhere (fitted 2026-11-11, `data/raw/lroc/README.md`).
 */

import type { ColourGrade } from '../../../src/layers/body/textures/@types/ColourGrade';
import type { AlbedoDelight } from '../@types/AlbedoDelight';

// Inner-wall E/W (N/S) on de-lit z6, raw → de-lit, 2026-11-11: Copernicus 1.66 (1.22)
// → 0.88 (1.17), Tycho 2.69 (0.77) → 1.16 (0.94), King 2.38 (1.02) → 1.18 (0.93).
// Flatten and tame stay off: on the Moon low-frequency brightness is albedo.
export const MOON_WAC_DELIGHT: AlbedoDelight = {
  reliefShade: 0.3,
  photoSun: { kind: 'subsolar', offsetDeg: 72, seamLonDeg: -90 },
  reliefExaggeration: 4,
  flatten: 0,
  flattenRadiusDeg: 1.2,
  knee: 0.7,
  tame: 0,
  keepIce: 0,
};

// Graded z4 matches the SSS 8k Moon at |lat| < 60° (mean 0.582/0.569/0.566, sd
// 0.161/0.155/0.159). 1.1% clips white; a gamma only trades that for crushed
// shadows (γ 1.6: 0.4% white, 1.1% black) — WAC's tails are heavier than SSS's.
export const MOON_WAC_GRADE: ColourGrade = {
  ev: 0,
  contrast: 1,
  gamma: 1,
  saturation: 1,
  gain: [1.8025, 1.7422, 1.7823],
  offset: [0.1325, 0.1344, 0.1218],
};
