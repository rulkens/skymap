// src/components/containers/DebugPanelContainer.tsx
/**
 * DebugPanelContainer — store boundary for the developer debug panel.
 *
 * Owns ALL store reads and dispatch for the DebugPanel subtree, including the
 * clip/tour controls (`onPlayClip` / `onStopClip` / `onStartTour`) and the
 * `onTogglePass` handler previously inline in `RenderTogglesSection`.
 * `DebugPanel` and its children import nothing from `store/` or `state/`.
 *
 * The clip/tour controls are plain dispatches: `playClip` / `stopClip` /
 * `startTour` are request actions consumed by sagas (`watchClipSaga` / `watchTourSaga`),
 * so the container needs no engine handle — it dispatches like every other knob
 * here. The "now playing" readout reads `selectClipActive` (live clip state)
 * instead of awaiting a Promise. Only the genuinely handle-bound engine props
 * (`slots`, `timingService`, `passNames`) are still passed in by App, gated on
 * `debugPanelOpen && handleRef.current`.
 *
 * `onTogglePass` reads `disabledPasses[pass]` in its body, so its
 * `useCallback` dep array is `[dispatch, disabledPasses]` — NOT the
 * `[dispatch]`-only pattern used by the simple boolean toggles. This
 * preserves the existing `disabled: disabledPasses[pass] !== true` toggle
 * semantics exactly.
 */

import { memo, useCallback } from 'react';
import { DebugPanel } from '../DebugPanel/DebugPanel';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectShowPickBuffer,
  selectShowDiskRadiusRing,
  selectDisabledPasses,
  selectHighlightFallback,
  selectRealOnly,
  selectFlow,
} from '../../state/settings/selectors';
import {
  setShowPickBuffer,
  setShowDiskRadiusRing,
  setHighlightFallback,
  setRealOnly,
  setFlow,
  setPassDisabled,
} from '../../state/settings/settingsSlice';
import { selectClipActive } from '../../state/camera/selectors';
import { playClip, stopClip } from '../../state/camera/clipActions';
import { startTour } from '../../state/tour/tourActions';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import type { ClipData } from '../../@types/animation/ClipData';
import type { BeatData } from '../../@types/tour/BeatData';

export type DebugPanelContainerProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService;
  passNames: readonly string[];
};

function DebugPanelContainer({
  slots,
  timingService,
  passNames,
}: DebugPanelContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();

  const showPickBuffer = useAppSelector(selectShowPickBuffer);
  const showDiskRadiusRing = useAppSelector(selectShowDiskRadiusRing);
  const disabledPasses = useAppSelector(selectDisabledPasses);
  const highlightFallback = useAppSelector(selectHighlightFallback);
  const realOnlyMode = useAppSelector(selectRealOnly);
  const flow = useAppSelector(selectFlow);
  const clipActive = useAppSelector(selectClipActive);

  const onShowPickBufferChange = useCallback(
    (enabled: boolean) => dispatch(setShowPickBuffer(enabled)),
    [dispatch],
  );

  const onShowDiskRadiusRingChange = useCallback(
    (enabled: boolean) => dispatch(setShowDiskRadiusRing(enabled)),
    [dispatch],
  );

  const onHighlightFallbackChange = useCallback(
    (enabled: boolean) => dispatch(setHighlightFallback(enabled)),
    [dispatch],
  );

  const onRealOnlyModeChange = useCallback(
    (enabled: boolean) => dispatch(setRealOnly(enabled)),
    [dispatch],
  );

  const onFlowChange = useCallback(
    (patch: Partial<FlowFieldDefaults>) => dispatch(setFlow(patch)),
    [dispatch],
  );

  // Clip/tour controls — plain dispatches of request actions. The sagas
  // (`watchClipSaga` / `watchTourSaga`) own the engine-side work.
  const onPlayClip = useCallback((clip: ClipData) => dispatch(playClip(clip)), [dispatch]);
  const onStopClip = useCallback(() => dispatch(stopClip()), [dispatch]);
  const onStartTour = useCallback(
    (beats: readonly BeatData[]) => dispatch(startTour(beats)),
    [dispatch],
  );

  // Reads `disabledPasses[pass]` in its body — dep array includes `disabledPasses`
  // so the callback captures the current record on each store update.
  const onTogglePass = useCallback(
    (pass: string) => dispatch(setPassDisabled({ pass, disabled: disabledPasses[pass] !== true })),
    [dispatch, disabledPasses],
  );

  return (
    <DebugPanel
      slots={slots}
      timingService={timingService}
      passNames={passNames}
      disabledPasses={disabledPasses}
      highlightFallback={highlightFallback}
      realOnlyMode={realOnlyMode}
      onHighlightFallbackChange={onHighlightFallbackChange}
      onRealOnlyModeChange={onRealOnlyModeChange}
      showPickBuffer={showPickBuffer}
      onShowPickBufferChange={onShowPickBufferChange}
      showDiskRadiusRing={showDiskRadiusRing}
      onShowDiskRadiusRingChange={onShowDiskRadiusRingChange}
      flow={flow}
      onFlowChange={onFlowChange}
      onTogglePass={onTogglePass}
      clipActive={clipActive}
      onPlayClip={onPlayClip}
      onStopClip={onStopClip}
      onStartTour={onStartTour}
    />
  );
}

export default memo(DebugPanelContainer);
