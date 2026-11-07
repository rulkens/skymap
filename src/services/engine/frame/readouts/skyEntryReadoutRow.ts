import type { FrameReadoutRow } from '../../../../@types/engine/frame/FrameReadoutRow';
import { engineSkyEntryReported } from '../../../../state/engine/engineSlice';
import { isBodyArm } from '../../camera/arms/body/isBodyArm';
import { skyEntryFactsAt } from '../../../../utils/sky/skyEntryFactsAt';
import { NO_SKY_ENTRY } from '../../../../data/sky/noSkyEntry';
import { skyEntryChanged } from '../../../../utils/sky/skyEntryChanged';
import { selectSkyEntryFacts } from '../../../../state/engine/selectors';

/** Where "Look up from here" would stand, from the booted frame's authored pose; sub-metre drift is not news. */
export const skyEntryReadoutRow: FrameReadoutRow = {
  publish: (frame, dispatch) => {
    if (!frame.booted) return;
    const { framed, canvasCssPx } = frame;
    const facts = isBodyArm(framed)
      ? skyEntryFactsAt(
          framed.pose,
          [canvasCssPx.width, canvasCssPx.height],
          frame.frustum,
          frame.fovYRad,
          frame.terrainHeightAt,
        )
      : NO_SKY_ENTRY;
    if (skyEntryChanged(selectSkyEntryFacts(frame.stored), facts)) {
      dispatch(engineSkyEntryReported(facts));
    }
  },
};
