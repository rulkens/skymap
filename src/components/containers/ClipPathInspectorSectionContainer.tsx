// src/components/containers/ClipPathInspectorSectionContainer.tsx
/**
 * ClipPathInspectorSectionContainer — store boundary for the clip-path debug
 * overlay controls.
 *
 * Owns all Redux reach for the section: reads `selectClipPathInspectId` +
 * `selectClipPathScrub` and wraps the `inspectClipPath` / `clearClipPath` /
 * `setClipPathScrub` dispatches in `useCallback`. Mounted directly by
 * `DebugPanel` so its scalars don't prop-drill through the panel — a scrub drag
 * re-renders only this subtree, not the whole DebugPanel.
 *
 * All three handlers close over nothing but `dispatch`, so `[dispatch]` is the
 * sole dep and each keeps a stable identity across the panel's re-renders.
 */

import { useCallback } from 'react';
import { ClipPathInspectorSection } from '../DebugPanel/ClipPathInspectorSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectClipPathInspectId, selectClipPathScrub } from '../../state/settings/selectors';
import {
  inspectClipPath,
  clearClipPath,
  setClipPathScrub,
} from '../../state/settings/settingsSlice';
import type { ClipId } from '../../@types/animation/ClipId';

function ClipPathInspectorSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const inspectId = useAppSelector(selectClipPathInspectId);
  const scrub01 = useAppSelector(selectClipPathScrub);

  const onInspect = useCallback((id: ClipId) => dispatch(inspectClipPath(id)), [dispatch]);
  const onClear = useCallback(() => dispatch(clearClipPath()), [dispatch]);
  const onScrub = useCallback((next: number) => dispatch(setClipPathScrub(next)), [dispatch]);

  return (
    <ClipPathInspectorSection
      inspectId={inspectId}
      scrub01={scrub01}
      onInspect={onInspect}
      onClear={onClear}
      onScrub={onScrub}
    />
  );
}

export default ClipPathInspectorSectionContainer;
