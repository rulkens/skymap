// src/components/containers/FlowSectionContainer.tsx
/**
 * FlowSectionContainer — store boundary for the Flow settings section.
 *
 * Owns all Redux reach for the Flow group: reads `selectFlow` and wraps the
 * `setFlowEnabled` (master gate) and `setFlow` (knob patch) dispatches in
 * `useCallback`. The presentational `FlowSection` imports nothing from `store/`
 * or `state/`.
 *
 * `selectFlow` has two independent subscribers: this container and
 * `FlowTuningSectionContainer`. Each subscriber re-renders only its own
 * subtree on a flow change — correct per spec §2 (independent subtree
 * isolation).
 *
 * ### Handler stability
 *
 * Both handlers close over no store-read values — each only needs `dispatch`,
 * which is the invariant `store.dispatch` across the component's lifetime.
 * `[dispatch]` is the sole dep, giving each handler permanent stable identity
 * and letting `FlowSection`'s `memo` bail correctly on parent re-renders.
 */

import { memo, useCallback } from 'react';
import FlowSection from '../SettingsPanel/FlowSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFlow } from '../../state/settings/selectors';
import { setFlow, setFlowEnabled } from '../../state/settings/settingsSlice';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';

function FlowSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const flow = useAppSelector(selectFlow);

  const onEnabledChange = useCallback(
    (enabled: boolean) => dispatch(setFlowEnabled(enabled)),
    [dispatch],
  );

  const onFlowChange = useCallback(
    (patch: Partial<FlowFieldDefaults>) => dispatch(setFlow(patch)),
    [dispatch],
  );

  return <FlowSection flow={flow} onEnabledChange={onEnabledChange} onFlowChange={onFlowChange} />;
}

export default memo(FlowSectionContainer);
