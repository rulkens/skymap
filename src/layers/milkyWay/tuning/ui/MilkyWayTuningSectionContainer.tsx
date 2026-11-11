/**
 * MilkyWayTuningSectionContainer — store boundary for the DebugPanel's
 * Milky-Way knobs. `selectMilkyWay` returns the whole cluster (the board reads
 * every knob), so this subtree re-renders on any Milky-Way write — including
 * the visibility toggle — which is the right granularity for a board that is
 * closed most of the time.
 */

import { memo, useCallback } from 'react';
import { MilkyWayTuningSection } from './MilkyWayTuningSection';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectMilkyWay } from '../../state/milkyWay/selectors';
import {
  setMilkyWayCloudTuning,
  setMilkyWayFieldTuning,
  setMilkyWayRenderer,
} from '../../state/milkyWay/slice';
import type { MilkyWayCloudTuning } from '../../../../@types/settings/MilkyWayCloudTuning';
import type { MilkyWayFieldTuning } from '../../@types/MilkyWayFieldTuning';
import type { MilkyWayRenderer } from '../../@types/MilkyWayRenderer';

function MilkyWayTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const milkyWay = useAppSelector(selectMilkyWay);

  const onCloudChange = useCallback(
    (patch: Partial<MilkyWayCloudTuning>) => dispatch(setMilkyWayCloudTuning(patch)),
    [dispatch],
  );
  const onFieldChange = useCallback(
    (patch: Partial<MilkyWayFieldTuning>) => dispatch(setMilkyWayFieldTuning(patch)),
    [dispatch],
  );
  const onRendererChange = useCallback(
    (renderer: MilkyWayRenderer) => dispatch(setMilkyWayRenderer(renderer)),
    [dispatch],
  );

  return (
    <MilkyWayTuningSection
      milkyWay={milkyWay}
      onCloudChange={onCloudChange}
      onFieldChange={onFieldChange}
      onRendererChange={onRendererChange}
    />
  );
}

export default memo(MilkyWayTuningSectionContainer);
