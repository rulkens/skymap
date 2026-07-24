// src/components/containers/DebugPanelContainer.tsx
/**
 * DebugPanelContainer — store boundary for the developer debug panel's
 * top-level knobs (pick/disk-ring toggles, flow, galaxy provenance, render toggles).
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
 *
 * The provenance totals are summed here rather than in a selector: the engine
 * slice holds one entry per source, and the panel wants one row. The store
 * record is a stable reference between commits, so a `useMemo` on it holds
 * without needing `createSelector`'s memoization.
 */

import { memo, useCallback, useMemo } from 'react';
import { DebugPanel } from '../DebugPanel/DebugPanel';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectShowPickBuffer,
  selectShowDiskRadiusRing,
  selectDisabledPasses,
  selectGalaxyProvenance,
  selectFlow,
} from '../../state/settings/selectors';
import { selectProvenanceCounts } from '../../state/engine/selectors';
import {
  setShowPickBuffer,
  setShowDiskRadiusRing,
  setProvenanceHighlight,
  setProvenanceFilter,
  setFlow,
  setPassDisabled,
} from '../../state/settings/settingsSlice';
import { sumProvenanceCounts } from '../../utils/sumProvenanceCounts';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FrameStats } from '../../@types/engine/FrameStats';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import type { ProvenanceAxisId } from '../../@types/settings/ProvenanceAxisId';
import type { ProvenanceFilter } from '../../@types/settings/ProvenanceFilter';

export type DebugPanelContainerProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService;
  frameStats: () => FrameStats;
  passNames: readonly string[];
};

function DebugPanelContainer({
  slots,
  timingService,
  frameStats,
  passNames,
}: DebugPanelContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();

  const showPickBuffer = useAppSelector(selectShowPickBuffer);
  const showDiskRadiusRing = useAppSelector(selectShowDiskRadiusRing);
  const disabledPasses = useAppSelector(selectDisabledPasses);
  const provenance = useAppSelector(selectGalaxyProvenance);
  const provenanceCountsBySource = useAppSelector(selectProvenanceCounts);
  const flow = useAppSelector(selectFlow);

  const provenanceCounts = useMemo(
    () => sumProvenanceCounts(provenanceCountsBySource),
    [provenanceCountsBySource],
  );

  const onShowPickBufferChange = useCallback(
    (enabled: boolean) => dispatch(setShowPickBuffer(enabled)),
    [dispatch],
  );

  const onShowDiskRadiusRingChange = useCallback(
    (enabled: boolean) => dispatch(setShowDiskRadiusRing(enabled)),
    [dispatch],
  );

  const onProvenanceHighlightChange = useCallback(
    (axis: ProvenanceAxisId, highlight: boolean) =>
      dispatch(setProvenanceHighlight({ axis, highlight })),
    [dispatch],
  );

  const onProvenanceFilterChange = useCallback(
    (axis: ProvenanceAxisId, filter: ProvenanceFilter) =>
      dispatch(setProvenanceFilter({ axis, filter })),
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
      frameStats={frameStats}
      passNames={passNames}
      disabledPasses={disabledPasses}
      provenance={provenance}
      provenanceCounts={provenanceCounts}
      onProvenanceHighlightChange={onProvenanceHighlightChange}
      onProvenanceFilterChange={onProvenanceFilterChange}
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
