// src/components/containers/ZoneOfAvoidanceTuningSectionContainer.tsx
/**
 * ZoneOfAvoidanceTuningSectionContainer — store boundary for the DebugPanel's
 * Zone-of-Avoidance guide-band tuning knobs. `selectZoneOfAvoidance` returns
 * the whole cluster (the slider board reads every knob), so this subtree
 * re-renders on any Zone-of-Avoidance write — including the visibility
 * toggles — which is the right granularity for a small slider board that is
 * closed most of the time.
 */

import { memo, useCallback } from 'react';
import { ZoneOfAvoidanceTuningSection } from '../DebugPanel/ZoneOfAvoidanceTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectZoneOfAvoidance } from '../../state/settings/selectors';
import { setZoneOfAvoidanceTuning } from '../../state/settings/settingsSlice';
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';

function ZoneOfAvoidanceTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const zoneOfAvoidance = useAppSelector(selectZoneOfAvoidance);

  const onChange = useCallback(
    (patch: Partial<ZoneOfAvoidanceTuning>) => dispatch(setZoneOfAvoidanceTuning(patch)),
    [dispatch],
  );

  return <ZoneOfAvoidanceTuningSection zoneOfAvoidance={zoneOfAvoidance} onChange={onChange} />;
}

export default memo(ZoneOfAvoidanceTuningSectionContainer);
