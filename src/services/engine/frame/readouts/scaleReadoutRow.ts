import type { FrameReadoutRow } from '../../../../@types/engine/frame/FrameReadoutRow';
import { computeScaleInfo } from '../../helpers/scaleBar';
import { engineScaleChanged } from '../../../../state/engine/engineSlice';
import { SCALE_TARGET_PX } from '../../../../data/layout/scaleTargetPx';

/** The scale bar's legend, from boot on (not-ready frames too); a degenerate viewport publishes nothing, so the last label holds. */
export const scaleReadoutRow: FrameReadoutRow = {
  publish: (frame, dispatch) => {
    if (!frame.booted) return;
    const scaleInfo = computeScaleInfo({
      cam: { distance: frame.altitudeMpc, fovYRad: frame.fovYRad },
      canvasSize: frame.canvasCssPx,
      targetPx: SCALE_TARGET_PX,
    });
    if (scaleInfo !== null) dispatch(engineScaleChanged(scaleInfo));
  },
};
