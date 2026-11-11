/**
 * moonAlbedoRecipe — the LROC WAC de-light and grade. The WAC morphologic
 * mosaic is shot at 55–75° incidence, Sun from the west east of lon −88°.
 * Known limit: west of −88° the mosaic's Sun is from the EAST, so this fixed
 * photo Sun doubles the relief there instead of removing it.
 */

import type { ColourGrade } from '../../../src/layers/body/textures/@types/ColourGrade';
import type { AlbedoDelight } from '../@types/AlbedoDelight';

// Tuned 2026-11-11 on de-lit z6 pixels, east/west inner-wall brightness
// (raw → de-lit): Copernicus 1.66 → 0.83, Tycho 2.69 → 1.25, King 2.38 → 1.11.
// No fixed Sun gets all three nearer 1: the mosaic's Sun follows latitude.
// Flatten and tame stay off: on the Moon low-frequency brightness is albedo.
export const MOON_WAC_DELIGHT: AlbedoDelight = {
  reliefShade: 0.35,
  photoSunAzDeg: 270,
  photoSunElDeg: 20,
  reliefExaggeration: 4,
  flatten: 0,
  flattenRadiusDeg: 1.2,
  knee: 0.7,
  tame: 0,
  keepIce: 0,
};

// Fitted 2026-11-11 through `gradeRgbaInPlace` (refit until the clip at 1 was
// absorbed) so the graded z4 matches the Solar System Scope 8k Moon, |lat| < 60°:
// mean 0.582/0.569/0.566, sd 0.161/0.155/0.159 per channel. 2.9% of pixels
// clip, where the SSS map has none: the de-lit WAC has a longer bright tail.
export const MOON_WAC_GRADE: ColourGrade = {
  ev: 0,
  contrast: 1,
  gamma: 1,
  saturation: 1,
  gain: [1.4768, 1.4284, 1.4597],
  offset: [0.1992, 0.1988, 0.1878],
};
