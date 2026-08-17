// src/components/containers/FlowTuningSectionContainer.tsx
/**
 * FlowTuningSectionContainer — store boundary for the DebugPanel's flow
 * power-user tuning knobs (count / trail / flowSpeed / densityBias / wander /
 * edgeFade). `selectFlow` has other independent subscribers (e.g.
 * `FlowSectionContainer`); each re-renders only its own subtree on a flow
 * change.
 */

import { memo, useCallback } from 'react';
import { FlowTuningSection } from '../DebugPanel/FlowTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFlow } from '../../state/settings/selectors';
import { setFlow } from '../../state/settings/settingsSlice';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';

function FlowTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const flow = useAppSelector(selectFlow);

  const onChange = useCallback(
    (patch: Partial<FlowFieldDefaults>) => dispatch(setFlow(patch)),
    [dispatch],
  );

  return <FlowTuningSection flow={flow} onChange={onChange} />;
}

export default memo(FlowTuningSectionContainer);
