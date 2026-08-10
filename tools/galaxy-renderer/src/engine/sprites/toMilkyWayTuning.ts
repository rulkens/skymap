/**
 * toMilkyWayTuning — the tool's render bag, viewed as the app's
 * `MilkyWayTuning`: the shape `packCloudUniforms` and the shared shaders
 * speak. Two knobs are renamed rather than shared outright — the tool's
 * `starIntensity` is the app's per-sprite `exposure` (the tool already spells
 * `exposure` for the post chain's whole-frame multiplier, a different
 * quantity at a different stage), and `sizeScale` is `starSizeScale`.
 * `aggregateDivisor`/`starCount` ride along for completeness even though the
 * uniform ignores both: the divisor reaches the frame by sizing
 * `aggregateTex`, the count by carving the layouts.
 */
import type { LodSettings } from '../../../@types/engine/LodSettings';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import type { MilkyWayTuning } from '../../../../../src/@types/settings/MilkyWayTuning';

/**
 * @param starCount the carved CAPACITY, not the count the generator was asked
 * for. In the app those are one field, because the request lives on
 * `MilkyWayTuning` itself; in the tool the request is a `GalaxyParams` knob
 * and only the realised capacity survives `setParams`. No consumer of this
 * view reads the field, so the honest available number beats retaining a
 * second copy of the request to satisfy a shape.
 */
export function toMilkyWayTuning(
  render: RenderSettings & LodSettings,
  starCount: number,
): MilkyWayTuning {
  return {
    starSizeScale: render.sizeScale,
    exposure: render.starIntensity,
    starPxMin: render.starPxMin,
    starPxMax: render.starPxMax,
    softness: render.softness,
    lodApparent: render.lodApparent,
    aggregateDivisor: render.aggregateDivisor,
    starCount,
  };
}
