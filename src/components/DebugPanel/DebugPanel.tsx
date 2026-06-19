/**
 * DebugPanel — the umbrella for the dev panel.
 *
 * Four sections: `AssetLoadingSection` (slot-progress rows),
 * `GpuTimingsSection` (per-pass GPU timing live readout),
 * `RenderTogglesSection` (per-pass on/off checkboxes for visual
 * debugging), and `DataQualitySection` (catalog-audit diagnostics
 * such as the orientation-fallback toggles).  Mount is owned by
 * `App.tsx` (toggled by the `d` keyboard shortcut); when this
 * component renders, all sections always render — section-level
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
 * `RenderTogglesSection` and `DataQualitySection` both default to
 * closed (most sessions won't need to flip a renderer off or audit
 * data quality); the other two default to open because their data
 * is the primary reason for opening the panel.
 */

import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import { AssetLoadingSection } from './AssetLoadingSection';
import { GpuTimingsSection } from './GpuTimingsSection';
import { RenderTogglesSection } from './RenderTogglesSection';
import { FlowTuningSection } from './FlowTuningSection';
import { DataQualitySection } from './DataQualitySection';
import { LabelEffectsSection } from './LabelEffectsSection';

export type DebugPanelProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService;
  /** Pass names in draw order, sourced from the engine handle's `passOverrides.allNames`. */
  passNames: readonly string[];
  /**
   * Live disabled-pass record from the settings store (App subscribes via
   * `selectDisabledPasses`).  Checkbox writes dispatch `setPassDisabled`;
   * `watchWake` wakes the render loop on the store write.
   */
  disabledPasses: Record<string, boolean>;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  onHighlightFallbackChange: (enabled: boolean) => void;
  onRealOnlyModeChange: (enabled: boolean) => void;
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
   * Flow overlay slice + its patch callback.  App-owned and optimistic, like
   * the other DebugPanel toggles: `onFlowChange` applies a `Partial<FlowSettings>`
   * to both the React mirror and the engine handle.  The dev-only motion knobs
   * (count / trail / flowSpeed / densityBias / wander / edgeFade) live in
   * FlowTuningSection, driven from the flow field registry.
   */
  flow: FlowSettings;
  onFlowChange: (patch: Partial<FlowSettings>) => void;
};

export function DebugPanel({
  slots,
  timingService,
  passNames,
  disabledPasses,
  highlightFallback,
  realOnlyMode,
  onHighlightFallbackChange,
  onRealOnlyModeChange,
  showPickBuffer,
  onShowPickBufferChange,
  showDiskRadiusRing,
  onShowDiskRadiusRingChange,
  flow,
  onFlowChange,
}: DebugPanelProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        background: 'rgba(0,0,0,0.85)',
        color: '#cfc',
        font: '11px/1.4 ui-monospace, monospace',
        padding: '8px 10px',
        borderRadius: 4,
        zIndex: 99999,
        maxWidth: 480,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 6, opacity: 0.8 }}>Skymap Debug</div>
      <AssetLoadingSection slots={slots} />
      <div style={{ marginTop: 6 }} />
      <GpuTimingsSection service={timingService} />
      <div style={{ marginTop: 6 }} />
      <RenderTogglesSection passNames={passNames} disabledPasses={disabledPasses} />
      <div style={{ marginTop: 6 }} />
      <FlowTuningSection flow={flow} onChange={onFlowChange} />
      <div style={{ marginTop: 6 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showPickBuffer}
          onChange={(e) => onShowPickBufferChange(e.target.checked)}
        />
        <span>Show pick buffer</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showDiskRadiusRing}
          onChange={(e) => onShowDiskRadiusRingChange(e.target.checked)}
        />
        <span>Show disk radius ring</span>
      </label>
      <div style={{ marginTop: 6 }} />
      <DataQualitySection
        highlightFallback={highlightFallback}
        realOnlyMode={realOnlyMode}
        onHighlightFallbackChange={onHighlightFallbackChange}
        onRealOnlyModeChange={onRealOnlyModeChange}
      />
      <div style={{ marginTop: 6 }} />
      <LabelEffectsSection />
    </div>
  );
}
