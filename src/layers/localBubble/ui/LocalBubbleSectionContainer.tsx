// src/layers/localBubble/ui/LocalBubbleSectionContainer.tsx
/**
 * LocalBubbleSectionContainer — the Local Bubble section's store boundary
 * AND its presentation, combined: two controls (a master toggle, an
 * intensity slider) don't earn the Container/Section split heavier
 * multi-control layers like Flow use — see that layer's `ui/` for the
 * pattern when this section grows a second row.
 */

import { memo, useCallback } from 'react';
import CollapsibleSection from '../../../components/SettingsPanel/CollapsibleSection';
import Slider from '../../../components/common/Slider/Slider';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectSettings } from '../../../state/settings/selectors';
import { setLocalBubbleEnabled, setLocalBubbleIntensity } from '../settings/localBubbleSlice';

function LocalBubbleSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const localBubble = useAppSelector((state) => selectSettings(state).localBubble);

  const onEnabledChange = useCallback(
    (enabled: boolean) => dispatch(setLocalBubbleEnabled(enabled)),
    [dispatch],
  );
  const onIntensityChange = useCallback(
    (intensity: number) => dispatch(setLocalBubbleIntensity(intensity)),
    [dispatch],
  );

  return (
    <CollapsibleSection
      title="Local Bubble"
      headerToggle={localBubble.enabled}
      onHeaderToggleChange={onEnabledChange}
    >
      <Slider
        label="Intensity"
        value={localBubble.intensity}
        min={0}
        max={2}
        step={0.05}
        disabled={!localBubble.enabled}
        onChange={onIntensityChange}
      />
    </CollapsibleSection>
  );
}

export default memo(LocalBubbleSectionContainer);
