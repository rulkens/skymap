/**
 * Store boundary for the DebugPanel's black-hole lens tuning knobs. Mirrors
 * `ZoneOfAvoidanceTuningSectionContainer`: `selectBlackHoleLensingTuning`
 * returns the whole cluster (the slider board reads every knob), so this
 * subtree re-renders on any write to it — the right granularity for a small
 * slider board that is closed most of the time.
 */

import { memo, useCallback } from 'react';
import { BlackHoleLensingTuningSection } from './BlackHoleLensingTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectBlackHoleLensingTuning } from '../state/lensingTuning/selectors';
import { setBlackHoleLensingTuning } from '../state/lensingTuning/slice';
import type { BlackHoleLensingTuning } from '../@types/BlackHoleLensingTuning';

function BlackHoleLensingTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector(selectBlackHoleLensingTuning);

  const onChange = useCallback(
    (patch: Partial<BlackHoleLensingTuning>) => dispatch(setBlackHoleLensingTuning(patch)),
    [dispatch],
  );

  return <BlackHoleLensingTuningSection tuning={tuning} onChange={onChange} />;
}

export default memo(BlackHoleLensingTuningSectionContainer);
