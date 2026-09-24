/**
 * Store boundary for the DebugPanel's Sgr A* lens tuning knobs. Mirrors
 * `ZoneOfAvoidanceTuningSectionContainer`: `selectBlackHoleLensingTuning`
 * returns the whole cluster (the slider board reads every knob), so this
 * subtree re-renders on any write to it — the right granularity for a small
 * slider board that is closed most of the time.
 */

import { memo, useCallback } from 'react';
import { SgrAStarLensingTuningSection } from './SgrAStarLensingTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectBlackHoleLensingTuning } from '../state/lensingTuning/selectors';
import { setBlackHoleLensingTuning } from '../state/lensingTuning/slice';
import type { SgrAStarLensingTuning } from '../@types/SgrAStarLensingTuning';

function SgrAStarLensingTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector(selectBlackHoleLensingTuning);

  const onChange = useCallback(
    (patch: Partial<SgrAStarLensingTuning>) => dispatch(setBlackHoleLensingTuning(patch)),
    [dispatch],
  );

  return <SgrAStarLensingTuningSection tuning={tuning} onChange={onChange} />;
}

export default memo(SgrAStarLensingTuningSectionContainer);
