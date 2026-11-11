/**
 * moonAlbedoRecipe — the LROC WAC de-light and grade. The WAC morphologic
 * mosaic is shot at 55–75° incidence with the Sun from the west, so the
 * photo Sun sits at azimuth 270°. Knobs past the Sun start from Mars's
 * (`marsAlbedoRecipe.ts`) until the eye check tunes them; the grade is
 * identity until it is fitted against the base globe.
 */

import type { ColourGrade } from '../../../src/layers/body/textures/@types/ColourGrade';
import type { AlbedoDelight } from '../@types/AlbedoDelight';

export const MOON_WAC_DELIGHT: AlbedoDelight = {
  reliefShade: 0.36,
  photoSunAzDeg: 270,
  photoSunElDeg: 25,
  reliefExaggeration: 6,
  flatten: 0.6,
  flattenRadiusDeg: 1.2,
  knee: 0.7,
  tame: 0.7,
  // The Moon is colourless everywhere, so the ice guard would undo the
  // flattening on every polar pixel.
  keepIce: 0,
};

export const MOON_WAC_GRADE: ColourGrade = {
  ev: 0,
  contrast: 1,
  gamma: 1,
  saturation: 1,
  gain: [1, 1, 1],
  offset: [0, 0, 0],
};
