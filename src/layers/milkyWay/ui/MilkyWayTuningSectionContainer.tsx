/**
 * MilkyWayTuningSectionContainer — store boundary for the DebugPanel's
 * Milky-Way star-cloud tuning knobs. `selectMilkyWay` returns the whole
 * cluster (the slider board reads every knob), so this subtree re-renders on
 * any Milky-Way write — including the visibility toggle — which is the right
 * granularity for a six-slider board that is closed most of the time.
 */

import { memo, useCallback } from 'react';
import { MilkyWayTuningSection } from './MilkyWayTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectMilkyWay } from '../state/milkyWay/selectors';
import { setMilkyWayTuning } from '../state/milkyWay/slice';
import type { MilkyWayTuning } from '../../../@types/settings/MilkyWayTuning';

function MilkyWayTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const milkyWay = useAppSelector(selectMilkyWay);

  const onChange = useCallback(
    (patch: Partial<MilkyWayTuning>) => dispatch(setMilkyWayTuning(patch)),
    [dispatch],
  );

  return <MilkyWayTuningSection milkyWay={milkyWay} onChange={onChange} />;
}

export default memo(MilkyWayTuningSectionContainer);
