import type { FrameReadoutRow } from '../../../../@types/engine/frame/FrameReadoutRow';
import { skyEntryReported, skyViewReported } from '../../../../state/sky/skySlice';
import { selectSkyView } from '../../../../state/sky/selectSkyView';
import { isBodyArm } from '../../camera/arms/body/isBodyArm';
import { isSkyArm } from '../../camera/arms/sky/isSkyArm';
import { skyEntryFactsAt } from '../../../../utils/sky/skyEntryFactsAt';
import { NO_SKY_ENTRY } from '../../../../data/sky/noSkyEntry';
import { skyEntryChanged } from '../../../../utils/sky/skyEntryChanged';
import { SKY_VIEW_STEP_RAD } from '../../../../data/sky/skyViewStepRad';
import { roundToMultiple } from '../../../../utils/math/roundToMultiple';
import { wrapRadPositive } from '../../../../utils/math/wrapRadPositive';
import { skyViewChanged } from '../../../../utils/sky/skyViewChanged';
import { selectSkyEntryFacts } from '../../../../state/sky/selectSkyEntryFacts';

/**
 * The two sky facts, each dispatched only when it differs from the stored one: where
 * "Look up from here" would stand (body arm), and the standing view while the authored
 * frame is `sky` (D9: the frame alone says you stand), else null.
 */
export const skyReadoutRow: FrameReadoutRow = {
  publish: (frame, dispatch) => {
    if (!frame.booted) return;
    const { framed, host, canvasCssPx } = frame;
    const entry =
      isBodyArm(framed) && host !== null
        ? skyEntryFactsAt(
            framed.pose,
            host,
            [canvasCssPx.width, canvasCssPx.height],
            frame.frustum,
            frame.fovYRad,
          )
        : NO_SKY_ENTRY;
    if (skyEntryChanged(selectSkyEntryFacts(frame.stored), entry)) {
      dispatch(skyEntryReported(entry));
    }
    const view = isSkyArm(framed)
      ? {
          spot: framed.frame.sky,
          azimuthRad: wrapRadPositive(roundToMultiple(framed.pose.azimuthRad, SKY_VIEW_STEP_RAD)),
        }
      : null;
    if (skyViewChanged(selectSkyView(frame.stored), view)) dispatch(skyViewReported(view));
  },
};
