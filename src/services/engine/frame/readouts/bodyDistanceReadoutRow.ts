import type { FrameReadoutRow } from '../../../../@types/engine/frame/FrameReadoutRow';
import { engineBodyDistanceReported } from '../../../../state/engine/engineSlice';
import { distanceMpc } from '../../../../utils/math/distanceMpc';
import { selectionDriver } from '../../../../utils/selection/selectionDriver';
import { publishBodyDistanceGate } from './publishBodyDistanceGate';

/** Camera to focused-body distance for the InfoCard, on ready frames only; null unless an orbital body in this frame's map is focused. */
export const bodyDistanceReadoutRow: FrameReadoutRow = {
  publish: (frame, dispatch) => {
    if (!frame.isReady || !publishBodyDistanceGate(frame.nowMs)) return;
    const focusId = selectionDriver(frame.focusRow)?.poseId ?? null;
    const bodyState = focusId === null ? undefined : frame.bodyStates.get(focusId);
    dispatch(
      engineBodyDistanceReported(
        bodyState === undefined ? null : distanceMpc(frame.camPosMpc, bodyState.positionMpc),
      ),
    );
  },
};
