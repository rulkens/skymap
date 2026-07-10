// src/components/containers/DebugPanelContainer.tsx
/**
 * DebugPanelContainer — store boundary for the developer debug panel's
 * top-level knobs (pick/disk-ring toggles, flow, data-quality, render toggles).
 *
 * Owns the store reads + dispatch for those knobs plus the `onTogglePass`
 * handler previously inline in `RenderTogglesSection`. The clip/tour and
 * clip-path-inspector sections each own their store reach through their OWN
 * container (`ClipTriggersSectionContainer` / `ClipPathInspectorSectionContainer`,
 * mounted directly by `DebugPanel`), so their scalars don't prop-drill through
 * here. Only the genuinely handle-bound engine props (`slots`, `timingService`,
 * `passNames`) are passed in by App, gated on `debugPanelOpen && handleRef.current`.
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
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';

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
    />
  );
}

export default memo(DebugPanelContainer);
