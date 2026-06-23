// src/components/containers/DebugPanelContainer.tsx
/**
 * DebugPanelContainer — store boundary for the developer debug panel.
 *
 * Owns ALL store reads and dispatch for the DebugPanel subtree, including
 * the `onTogglePass` handler previously inline in `RenderTogglesSection`.
 * `DebugPanel` and its children import nothing from `store/` or `state/`.
 *
 * Engine props (`slots`, `timingService`, `passNames`) are passed in by App
 * because they come from `handleRef.current` — a non-Redux handle that the
 * container has no way to reach. The engine-prop gate (`debugPanelOpen &&
 * handleRef.current`) stays in App for the same reason.
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
  selectLensingEnabled,
  selectLensMode,
  selectLensStrengthDeg,
  selectLensScaleRadiusMpc,
} from '../../state/settings/selectors';
import {
  setShowPickBuffer,
  setShowDiskRadiusRing,
  setHighlightFallback,
  setRealOnly,
  setFlow,
  setPassDisabled,
  setLensingEnabled,
  setLensMode,
  setLensStrengthDeg,
  setLensScaleRadiusMpc,
} from '../../state/settings/settingsSlice';
import type { LensMode } from '../../@types/settings/LensMode';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FlowSettings } from '../../@types/settings/FlowSettings';

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
  const lensingEnabled = useAppSelector(selectLensingEnabled);
  const lensMode = useAppSelector(selectLensMode);
  const lensStrengthDeg = useAppSelector(selectLensStrengthDeg);
  const lensScaleRadiusMpc = useAppSelector(selectLensScaleRadiusMpc);

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
    (patch: Partial<FlowSettings>) => dispatch(setFlow(patch)),
    [dispatch],
  );

  const onLensingEnabledChange = useCallback(
    (enabled: boolean) => dispatch(setLensingEnabled(enabled)),
    [dispatch],
  );

  const onLensModeChange = useCallback((mode: LensMode) => dispatch(setLensMode(mode)), [dispatch]);

  const onLensStrengthDegChange = useCallback(
    (deg: number) => dispatch(setLensStrengthDeg(deg)),
    [dispatch],
  );

  const onLensScaleRadiusMpcChange = useCallback(
    (mpc: number) => dispatch(setLensScaleRadiusMpc(mpc)),
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
      lensingEnabled={lensingEnabled}
      lensMode={lensMode}
      lensStrengthDeg={lensStrengthDeg}
      lensScaleRadiusMpc={lensScaleRadiusMpc}
      onLensingEnabledChange={onLensingEnabledChange}
      onLensModeChange={onLensModeChange}
      onLensStrengthDegChange={onLensStrengthDegChange}
      onLensScaleRadiusMpcChange={onLensScaleRadiusMpcChange}
      onTogglePass={onTogglePass}
    />
  );
}

export default memo(DebugPanelContainer);
