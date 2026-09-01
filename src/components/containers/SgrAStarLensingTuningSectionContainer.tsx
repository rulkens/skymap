// src/components/containers/SgrAStarLensingTuningSectionContainer.tsx
/**
 * TEMPORARY (Task 15) — store boundary for the DebugPanel's Sgr A* lens
 * tuning knobs, deleted at the removal step. Mirrors
 * `ZoneOfAvoidanceTuningSectionContainer`: `selectSgrAStarLensingTuning`
 * returns the whole cluster (the slider board reads every knob), so this
 * subtree re-renders on any write to it — the right granularity for a small
 * slider board that is closed most of the time.
 */

import { memo, useCallback } from 'react';
import { SgrAStarLensingTuningSection } from '../DebugPanel/SgrAStarLensingTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectSgrAStarLensingTuning } from '../../state/settings/selectors';
import { setSgrAStarLensingTuning } from '../../state/settings/settingsSlice';
import type { SgrAStarLensingTuning } from '../../@types/settings/SgrAStarLensingTuning';

function SgrAStarLensingTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector(selectSgrAStarLensingTuning);

  const onChange = useCallback(
    (patch: Partial<SgrAStarLensingTuning>) => dispatch(setSgrAStarLensingTuning(patch)),
    [dispatch],
  );

  return <SgrAStarLensingTuningSection tuning={tuning} onChange={onChange} />;
}

export default memo(SgrAStarLensingTuningSectionContainer);
