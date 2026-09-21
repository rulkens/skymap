/**
 * LocalBubbleTuningSectionContainer — the Local Bubble's DebugPanel knobs and
 * their store boundary in one file: one slider does not earn the
 * Container/Section split. The on/off toggle lives in "Labels & guides".
 */

import { memo, useCallback } from 'react';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectSettings } from '../../../state/settings/selectors';
import { LOCAL_BUBBLE_SLIDER_FIELDS } from '../../../data/localBubble/localBubbleSliderFields';
import { setLocalBubbleIntensity } from '../state/localBubble/slice';

function LocalBubbleTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const localBubble = useAppSelector((state) => selectSettings(state).localBubble);
  const onSliderChange = useCallback(
    (_key: 'intensity', value: number) => dispatch(setLocalBubbleIntensity(value)),
    [dispatch],
  );

  return (
    <DebugTuningSection
      title="Local Bubble tuning"
      fields={LOCAL_BUBBLE_SLIDER_FIELDS}
      values={localBubble}
      onSliderChange={onSliderChange}
    />
  );
}

export default memo(LocalBubbleTuningSectionContainer);
