import type { FrameReadoutRow } from '../../../../@types/engine/frame/FrameReadoutRow';
import { engineSkyEntryReported } from '../../../../state/engine/engineSlice';
import { isBodyArm } from '../../camera/arms/body/isBodyArm';
import { skyEntryFactsAt } from '../../../../utils/sky/skyEntryFactsAt';
import { NO_SKY_ENTRY } from '../../../../data/sky/noSkyEntry';
import { skyEntryChanged } from '../../../../utils/sky/skyEntryChanged';

/** Where "Look up from here" would stand, from the booted frame's authored pose on its host. */
export const skyEntryReadoutRow: FrameReadoutRow = {
  publish: (frame, dispatch) => {
    if (!frame.booted) return;
    const { framed, canvasCssPx, host } = frame;
    const facts =
      isBodyArm(framed) && host !== null
        ? skyEntryFactsAt(
            framed.pose,
            host,
            [canvasCssPx.width, canvasCssPx.height],
            frame.frustum,
            frame.fovYRad,
          )
        : NO_SKY_ENTRY;
    if (skyEntryChanged(frame.lastSkyEntry, facts)) dispatch(engineSkyEntryReported(facts));
  },
};
