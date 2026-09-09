import type { SgrAStarLensingTuning } from '../../settings/SgrAStarLensingTuning';

/**
 * Keys of `SgrAStarLensingTuning` that surface as numeric DebugPanel
 * sliders. `cubemapResolutionPx` (a discrete `<select>`)
 * and `emissionTint` (a `Vec3` colour picker) get bespoke controls instead —
 * the same split `ZoneOfAvoidanceSliderKey` makes for its colour fields.
 */
export type SgrAStarLensingSliderKey = Exclude<
  keyof SgrAStarLensingTuning,
  'cubemapResolutionPx' | 'emissionTint'
>;
