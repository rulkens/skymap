import type { BlackHoleLensingTuning } from '../../@types/BlackHoleLensingTuning';

/**
 * Keys of `BlackHoleLensingTuning` that surface as numeric DebugPanel
 * sliders. `cubemapResolutionPx` (a discrete `<select>`)
 * and `emissionTint` (a `Vec3` colour picker) get bespoke controls instead —
 * the same split `ZoneOfAvoidanceSliderKey` makes for its colour fields.
 */
export type BlackHoleLensingSliderKey = Exclude<
  keyof BlackHoleLensingTuning,
  'cubemapResolutionPx' | 'emissionTint'
>;
