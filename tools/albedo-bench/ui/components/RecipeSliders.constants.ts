/** Every `AlbedoRecipe` slider, in the recipe's own step order (design §7/§8)
 *  so the panel mirrors the pipeline the values feed. */
import type { RecipeSliderRow } from '../../@types/RecipeSliderRow';

// prettier-ignore
export const RECIPE_SLIDER_ROWS: readonly RecipeSliderRow[] = [
  { section: 'Sun fit', label: 'window (km)', path: ['sunFit', 'windowKm'], min: 5, max: 100, step: 1 },
  { section: 'Sun fit', label: 'stride (km)', path: ['sunFit', 'strideKm'], min: 2, max: 100, step: 1 },
  { section: 'Sun fit', label: 'high pass (km)', path: ['sunFit', 'highPassKm'], min: 1, max: 100, step: 1 },
  { section: 'Sun fit', label: 'min confidence', path: ['sunFit', 'minConfidence'], min: 0, max: 1, step: 0.01 },
  { section: 'Sun fit', label: 'fill sigma (km)', path: ['sunFit', 'fillSigmaKm'], min: 5, max: 200, step: 1 },
  { section: 'De-shade', label: 'strength', path: ['deshade', 'strength'], min: 0, max: 2, step: 0.01 },
  { section: 'De-shade', label: 'min shading', path: ['deshade', 'minShading'], min: 0.05, max: 1, step: 0.01 },
  { section: 'Knee', label: 'threshold', path: ['knee', 'threshold'], min: 0, max: 1, step: 0.01 },
  { section: 'Knee', label: 'softness', path: ['knee', 'softness'], min: 0, max: 5, step: 0.05 },
  { section: 'Ice', label: 'min |lat| (deg)', path: ['ice', 'minAbsLatDeg'], min: 0, max: 90, step: 1 },
  { section: 'Ice', label: 'fade (deg)', path: ['ice', 'fadeDeg'], min: 0, max: 30, step: 0.5 },
  { section: 'Ice', label: 'min whiteness', path: ['ice', 'minWhiteness'], min: 0, max: 1, step: 0.01 },
  { section: 'Ice', label: 'min luminance', path: ['ice', 'minLuminance'], min: 0, max: 1, step: 0.01 },
  { section: 'Grade', label: 'exposure (EV)', path: ['grade', 'ev'], min: -3, max: 3, step: 0.05 },
  { section: 'Grade', label: 'gain R', path: ['grade', 'gain', 0], min: 0, max: 2, step: 0.01 },
  { section: 'Grade', label: 'gain G', path: ['grade', 'gain', 1], min: 0, max: 2, step: 0.01 },
  { section: 'Grade', label: 'gain B', path: ['grade', 'gain', 2], min: 0, max: 2, step: 0.01 },
  { section: 'Grade', label: 'offset R', path: ['grade', 'offset', 0], min: -0.2, max: 0.2, step: 0.005 },
  { section: 'Grade', label: 'offset G', path: ['grade', 'offset', 1], min: -0.2, max: 0.2, step: 0.005 },
  { section: 'Grade', label: 'offset B', path: ['grade', 'offset', 2], min: -0.2, max: 0.2, step: 0.005 },
  { section: 'Grade', label: 'contrast', path: ['grade', 'contrast'], min: 0.5, max: 2, step: 0.01 },
  { section: 'Grade', label: 'saturation', path: ['grade', 'saturation'], min: 0, max: 2, step: 0.01 },
  { section: 'Grade', label: 'gamma', path: ['grade', 'gamma'], min: 0.3, max: 3, step: 0.01 },
];
