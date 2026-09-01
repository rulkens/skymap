import type { SgrAStarLensingTuning } from '../../settings/SgrAStarLensingTuning';

/**
 * TEMPORARY (Task 15). Keys of `SgrAStarLensingTuning` that surface as
 * numeric DebugPanel sliders. `cubemapResolutionPx` is excluded: it only
 * takes three meaningful values (256/512/1024), so the section gives it a
 * `<select>` instead — the same "bespoke control for a non-slider field"
 * split `ZoneOfAvoidanceSliderKey` makes for its `Vec3` colour fields.
 */
export type SgrAStarLensingSliderKey = Exclude<keyof SgrAStarLensingTuning, 'cubemapResolutionPx'>;
