/**
 * fieldHostRender — the field host's render section from the tool's own
 * knobs: every lane `FIELD_CALIBRATION.render` holds neutral, here set from
 * the tool's sliders, debug views and seeding view.
 */
import type { FieldHostTuning } from '../../../../../src/layers/milkyWay/field/host/@types/FieldHostTuning';
import type { IsmMapSeedingLanes } from '../../../../../src/layers/milkyWay/field/header/@types/IsmMapSeedingLanes';
import type { FrameView } from './deriveFrameView';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';

export function fieldHostRender(
  render: RenderSettings,
  views: Pick<FrameView, 'debugViews' | 'galaxyWeight'>,
  ismMapSeeding: IsmMapSeedingLanes,
): FieldHostTuning['render'] {
  return {
    hiiNearFadeStart: render.hiiNearFadeStart,
    hiiNearFadeEnd: render.hiiNearFadeEnd,
    starGrainWarpAmp: render.starGrainWarpAmp,
    hiiQuadCap: render.hiiQuadCap,
    starGrainFeatureScaleNear: render.starGrainFeatureScaleNear,
    starGrainFeatureScaleFar: render.starGrainFeatureScaleFar,
    orientationSigmaDerivTexels: render.orientationSigmaDerivTexels,
    orientationSigmaIntegTexels: render.orientationSigmaIntegTexels,
    debugViews: views.debugViews,
    galaxyWeight: views.galaxyWeight,
    ismMapChannels: {
      gasWeight: render.ismMapGasWeight,
      starsWeight: render.ismMapStarsWeight,
      activityWeight: render.ismMapActivityWeight,
      dustWeight: render.ismMapDustWeight,
    },
    ismMapSeeding,
  };
}
