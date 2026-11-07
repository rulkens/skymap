import type { FrameReadoutRow } from '../../../../@types/engine/frame/FrameReadoutRow';
import { engineSkyViewReported } from '../../../../state/engine/engineSlice';
import { isSkyArm } from '../../camera/arms/sky/isSkyArm';
import { SKY_VIEW_STEP_RAD } from '../../../../data/sky/skyViewStepRad';
import { roundToMultiple } from '../../../../utils/math/roundToMultiple';
import { skyViewChanged } from '../../../../utils/sky/skyViewChanged';
import { selectSkyView } from '../../../../state/engine/selectors';

/** The standing view while the authored frame is `sky` (D9: the frame alone says you stand), else null. */
export const skyViewReadoutRow: FrameReadoutRow = {
  publish: (frame, dispatch) => {
    if (!frame.booted) return;
    const { framed } = frame;
    const view = isSkyArm(framed)
      ? {
          spot: framed.frame.sky,
          azimuthRad: roundToMultiple(framed.pose.azimuthRad, SKY_VIEW_STEP_RAD),
          altitudeRad: roundToMultiple(framed.pose.altitudeRad, SKY_VIEW_STEP_RAD),
          fovYRad: roundToMultiple(frame.fovYRad, SKY_VIEW_STEP_RAD),
        }
      : null;
    if (skyViewChanged(selectSkyView(frame.stored), view)) dispatch(engineSkyViewReported(view));
  },
};
