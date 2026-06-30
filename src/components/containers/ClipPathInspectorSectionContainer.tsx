// src/components/containers/ClipPathInspectorSectionContainer.tsx
/**
 * ClipPathInspectorSectionContainer — store boundary for the clip-path debug
 * overlay controls.
 *
 * Owns all Redux reach for the section: reads `selectClipPathInspectId` +
 * `selectClipPathScrub` and wraps the `inspectClipPath` / `clearClipPath` /
 * `setClipPathScrub` / `replayInspectedPath` dispatches in `useCallback`.
 * Mounted directly by `DebugPanel` so its scalars don't prop-drill through the
 * panel — a scrub drag re-renders only this subtree, not the whole DebugPanel.
 *
 * Every handler closes over nothing but `dispatch`, so `[dispatch]` is the sole
 * dep and each keeps a stable identity across the panel's re-renders.
 */

import { useCallback } from 'react';
import { ClipPathInspectorSection } from '../DebugPanel/ClipPathInspectorSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectClipPathInspectId,
  selectClipPathScrub,
  selectClipPathAlign,
  selectClipPathRampSec,
  selectClipPathLinger,
  selectClipPathSpline,
  selectClipPathTurnDelay,
} from '../../state/settings/selectors';
import {
  inspectClipPath,
  clearClipPath,
  setClipPathScrub,
  setClipPathAlign,
  setClipPathRampSec,
  setClipPathLinger,
  setClipPathSpline,
  setClipPathTurnDelay,
} from '../../state/settings/settingsSlice';
import { replayInspectedPath } from '../../state/camera/clipActions';
import type { ClipId } from '../../@types/animation/ClipId';
import type { SplineMode } from '../../@types/animation/SplineMode';

function ClipPathInspectorSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const inspectId = useAppSelector(selectClipPathInspectId);
  const scrub01 = useAppSelector(selectClipPathScrub);
  const align = useAppSelector(selectClipPathAlign);
  const rampSec = useAppSelector(selectClipPathRampSec);
  const linger = useAppSelector(selectClipPathLinger);
  const spline = useAppSelector(selectClipPathSpline);
  const turnDelay = useAppSelector(selectClipPathTurnDelay);

  const onInspect = useCallback((id: ClipId) => dispatch(inspectClipPath(id)), [dispatch]);
  const onClear = useCallback(() => dispatch(clearClipPath()), [dispatch]);
  const onScrub = useCallback((next: number) => dispatch(setClipPathScrub(next)), [dispatch]);
  const onReplay = useCallback(() => dispatch(replayInspectedPath()), [dispatch]);
  const onAlign = useCallback((next: number) => dispatch(setClipPathAlign(next)), [dispatch]);
  const onRampSec = useCallback((next: number) => dispatch(setClipPathRampSec(next)), [dispatch]);
  const onLinger = useCallback((next: number) => dispatch(setClipPathLinger(next)), [dispatch]);
  const onSpline = useCallback((next: SplineMode) => dispatch(setClipPathSpline(next)), [dispatch]);
  const onTurnDelay = useCallback(
    (next: number) => dispatch(setClipPathTurnDelay(next)),
    [dispatch],
  );

  return (
    <ClipPathInspectorSection
      inspectId={inspectId}
      scrub01={scrub01}
      onInspect={onInspect}
      onClear={onClear}
      onScrub={onScrub}
      onReplay={onReplay}
      align={align}
      rampSec={rampSec}
      linger={linger}
      spline={spline}
      turnDelay={turnDelay}
      onAlign={onAlign}
      onRampSec={onRampSec}
      onLinger={onLinger}
      onSpline={onSpline}
      onTurnDelay={onTurnDelay}
    />
  );
}

export default ClipPathInspectorSectionContainer;
