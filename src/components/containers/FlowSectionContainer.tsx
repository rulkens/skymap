// src/components/containers/FlowSectionContainer.tsx
/**
 * FlowSectionContainer — store boundary for the Flow settings section.
 *
 * Owns all Redux reach for the Flow group: reads `selectFlow` and wraps the
 * `setFlow` dispatch in `useCallback`. The presentational `FlowSection` imports
 * nothing from `store/` or `state/`.
 *
 * `selectFlow` has two independent subscribers: this container and
 * `DebugPanelContainer`. Each subscriber re-renders only its own subtree on a
 * flow change — correct per spec §2 (independent subtree isolation).
 *
 * ### Handler stability
 *
 * `onFlowChange` closes over no store-read values — it only needs `dispatch`,
 * which is the invariant `store.dispatch` across the component's lifetime.
 * `[dispatch]` is the sole dep, giving the handler permanent stable identity
 * and letting `FlowSection`'s `memo` bail correctly on parent re-renders.
 */

import { memo, useCallback } from 'react';
import FlowSection from '../SettingsPanel/FlowSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFlow } from '../../state/settings/selectors';
import { setFlow } from '../../state/settings/settingsSlice';
import type { FlowSettings } from '../../@types/settings/FlowSettings';

function FlowSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const flow = useAppSelector(selectFlow);

  const onFlowChange = useCallback(
    (patch: Partial<FlowSettings>) => dispatch(setFlow(patch)),
    [dispatch],
  );

  return <FlowSection flow={flow} onFlowChange={onFlowChange} />;
}

export default memo(FlowSectionContainer);
