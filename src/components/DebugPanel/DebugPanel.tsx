/**
 * DebugPanel — the umbrella for the dev panel.
 *
 * Sections: `AssetLoadingSection` (slot-progress rows),
 * `GpuTimingsSection` (per-pass GPU timing live readout),
 * `RenderTogglesSection` (per-pass on/off checkboxes for visual
 * debugging), `FlowTuningSection`, `DebugOverlaysSection` (pick-buffer
 * / disk-radius-ring toggles), `GalaxyProvenanceSection` (catalog-audit
 * diagnostics for measured vs. estimated orientation and size), and two
 * self-contained sections mounted via their own store containers —
 * `ClipTriggersSectionContainer` (play/stop a registered clip + launch a guided
 * tour) and `ClipPathInspectorSectionContainer` (precompute + scrub a clip's
 * debug camera path) — so their store reach doesn't prop-drill through here.
 * Mount is owned by `App.tsx` (toggled by the `d` keyboard shortcut);
 * when this component renders, all sections always render — section-level
 * visibility (e.g. "GPU timings unavailable") is each section's
 * own concern.
 *
 * ### Why collapsible sections
 *
 * The asset-loading rows churn during startup (every catalog,
 * filaments, the font atlas, etc.), but go quiet once everything
 * is `ready` — a collapsed `<details>` keeps the panel compact
 * during steady-state runs.  GPU timings is the opposite (always
 * live), but the user might want to focus on one or the other.
 * `RenderTogglesSection`, `DebugOverlaysSection`, and
 * `GalaxyProvenanceSection` all default to closed (most sessions won't
 * need to flip a renderer off, a raw overlay, or audit orientation/size
 * provenance); the other two default to open because their data
 * is the primary reason for opening the panel.
 */

import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FrameStats } from '../../@types/engine/FrameStats';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import { AssetLoadingSection } from './AssetLoadingSection';
import { FrameStatsRow } from './FrameStatsRow';
import { GpuTimingsSection } from './GpuTimingsSection';
import { RenderTogglesSection } from './RenderTogglesSection';
import { FlowTuningSection } from './FlowTuningSection';
import DebugOverlaysSection from './DebugOverlaysSection';
import { GalaxyProvenanceSection } from './GalaxyProvenanceSection';
import ClipTriggersSectionContainer from '../containers/ClipTriggersSectionContainer';
import ClipPathInspectorSectionContainer from '../containers/ClipPathInspectorSectionContainer';
import styles from './DebugPanel.module.css';

export type DebugPanelProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService;
  /** Always-on CPU-side fps + JS-body-ms getter, polled by `FrameStatsRow` (no GPU query). */
  frameStats: () => FrameStats;
  /** Pass names in draw order, sourced from the engine handle's `passOverrides.allNames`. */
  passNames: readonly string[];
  /**
   * Live disabled-pass record from the settings store (`DebugPanelContainer`
   * subscribes via `selectDisabledPasses`).  A toggle calls `onTogglePass`,
   * the container dispatches `setPassDisabled`, and `watchWakeSaga` wakes the loop.
   */
  disabledPasses: Record<string, boolean>;
  /** Replace the colour of galaxies whose b/a + position-angle is estimated, not measured, with magenta. */
  highlightEstimatedOrientation: boolean;
  /** Discard estimated-orientation fragments entirely, leaving only measured galaxies. */
  onlyMeasuredOrientation: boolean;
  onHighlightEstimatedOrientationChange: (enabled: boolean) => void;
  onOnlyMeasuredOrientationChange: (enabled: boolean) => void;
  /** Replace the colour of galaxies whose diameter is estimated, not measured, with green. */
  highlightEstimatedSize: boolean;
  onHighlightEstimatedSizeChange: (enabled: boolean) => void;
  /**
   * Pick-buffer debug overlay toggle.  When on, the renderer paints a
   * colour-mapped RGBA layer over the tone-mapped frame so the
   * developer can see which billboards the picker actually claims.
   */
  showPickBuffer: boolean;
  onShowPickBufferChange: (enabled: boolean) => void;
  /**
   * Disk-radius debug ring toggle.  When on, the renderer outlines each
   * famous-galaxy thumbnail's disk-radius footprint so the developer can
   * calibrate the placement against the underlying billboard.
   */
  showDiskRadiusRing: boolean;
  onShowDiskRadiusRingChange: (enabled: boolean) => void;
  /**
   * Flow overlay slice + its knob-patch callback.  App-owned and optimistic,
   * like the other DebugPanel toggles: `onFlowChange` applies a
   * `Partial<FlowFieldDefaults>` to both the React mirror and the engine handle.
   * The dev-only motion knobs (count / trail / flowSpeed / densityBias / wander
   * / edgeFade) live in FlowTuningSection, driven from the flow field registry.
   * The master gate is not here — it rides the SettingsPanel header via
   * `setFlowEnabled`.
   */
  flow: FlowSettings;
  onFlowChange: (patch: Partial<FlowFieldDefaults>) => void;
  /**
   * Called with the pass name when a RenderTogglesSection checkbox is toggled.
   * Container (DebugPanelContainer) dispatches `setPassDisabled`; absorbed here
   * from the section so it is no longer a leaf-level store reach.
   */
  onTogglePass: (name: string) => void;
};

export function DebugPanel({
  slots,
  timingService,
  frameStats,
  passNames,
  disabledPasses,
  highlightEstimatedOrientation,
  onlyMeasuredOrientation,
  onHighlightEstimatedOrientationChange,
  onOnlyMeasuredOrientationChange,
  highlightEstimatedSize,
  onHighlightEstimatedSizeChange,
  showPickBuffer,
  onShowPickBufferChange,
  showDiskRadiusRing,
  onShowDiskRadiusRingChange,
  flow,
  onFlowChange,
  onTogglePass,
}: DebugPanelProps) {
  return (
    <div className={styles.root}>
      <div className={styles.title}>Skymap Debug</div>
      <AssetLoadingSection slots={slots} />
      {/* Always shown — its numbers need no GPU query, so it sits above the
          GPU timings section, which is dark without `?gpuTimings`. */}
      <FrameStatsRow frameStats={frameStats} />
      <GpuTimingsSection service={timingService} />
      <RenderTogglesSection
        passNames={passNames}
        disabledPasses={disabledPasses}
        onTogglePass={onTogglePass}
      />
      <FlowTuningSection flow={flow} onChange={onFlowChange} />
      <DebugOverlaysSection
        showPickBuffer={showPickBuffer}
        onShowPickBufferChange={onShowPickBufferChange}
        showDiskRadiusRing={showDiskRadiusRing}
        onShowDiskRadiusRingChange={onShowDiskRadiusRingChange}
      />
      <GalaxyProvenanceSection
        highlightEstimatedOrientation={highlightEstimatedOrientation}
        onlyMeasuredOrientation={onlyMeasuredOrientation}
        onHighlightEstimatedOrientationChange={onHighlightEstimatedOrientationChange}
        onOnlyMeasuredOrientationChange={onOnlyMeasuredOrientationChange}
        highlightEstimatedSize={highlightEstimatedSize}
        onHighlightEstimatedSizeChange={onHighlightEstimatedSizeChange}
      />
      <ClipTriggersSectionContainer />
      <ClipPathInspectorSectionContainer />
    </div>
  );
}
