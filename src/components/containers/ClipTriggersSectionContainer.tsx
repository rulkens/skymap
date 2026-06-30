// src/components/containers/ClipTriggersSectionContainer.tsx
/**
 * ClipTriggersSectionContainer — store boundary for the clips + tours trigger
 * controls.
 *
 * Owns the Redux reach for the section: reads `selectClipActive` (the live "is a
 * clip playing" flag the readout uses instead of awaiting a Promise) and wraps
 * the `startClip` / `stopClip` / `startTour` request-action dispatches in
 * `useCallback`. Mounted directly by `DebugPanel` so the clip/tour scalars don't
 * prop-drill through the panel — a clip-active flip re-renders only this subtree.
 *
 * The three dispatch handlers close over nothing but `dispatch`, so `[dispatch]`
 * is the sole dep and each keeps a stable identity across the panel's re-renders.
 */

import { useCallback } from 'react';
import { ClipTriggersSection } from '../DebugPanel/ClipTriggersSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectClipActive } from '../../state/camera/selectors';
import { startClip, stopClip } from '../../state/camera/clipActions';
import { startTour } from '../../state/tour/tourActions';
import type { ClipId } from '../../@types/animation/ClipId';
import type { TourId } from '../../@types/animation/tour/TourId';

function ClipTriggersSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const clipActive = useAppSelector(selectClipActive);

  const onStartClip = useCallback((id: ClipId) => dispatch(startClip(id)), [dispatch]);
  const onStopClip = useCallback(() => dispatch(stopClip()), [dispatch]);
  const onStartTour = useCallback((id: TourId) => dispatch(startTour(id)), [dispatch]);

  return (
    <ClipTriggersSection
      clipActive={clipActive}
      onStartClip={onStartClip}
      onStopClip={onStopClip}
      onStartTour={onStartTour}
    />
  );
}

export default ClipTriggersSectionContainer;
