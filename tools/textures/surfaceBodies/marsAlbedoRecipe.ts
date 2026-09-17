/**
 * marsAlbedoRecipe — the Viking de-light + grade the user tuned in the
 * albedo bench on 2026-09-17 (`.superpowers/sdd/2026-09-17-terrain-f4-mars/
 * albedo-bench-prototype/`), landed verbatim; a later PR replaces this with a
 * shared implementation. `flattenRadiusDeg` is the bench's 16 px at its
 * 0.075°/px tuning grid (16 * 0.075 = 1.2°).
 */

import type { ColourGrade } from '../../../src/@types/scene/ColourGrade';
import type { AlbedoDelight } from '../AlbedoDelight';

export const MARS_VIKING_DELIGHT: AlbedoDelight = {
  reliefShade: 0.36,
  photoSunAzDeg: 64,
  photoSunElDeg: 28,
  reliefExaggeration: 6,
  flatten: 0.6,
  flattenRadiusDeg: 1.2,
  knee: 0.7,
  tame: 0.7,
  keepIce: 0.7,
};

export const MARS_VIKING_GRADE: ColourGrade = {
  ev: 0.06,
  contrast: 1.12,
  gamma: 1,
  saturation: 0.91,
  gain: [1.4392, 1.3231, 0.9475],
  offset: [0.066, 0.049, 0.036],
};
