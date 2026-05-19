/**
 * DebugPanel — the umbrella for the renamed dev panel.
 *
 * Replaces the legacy `LoadingDevPanel` with a four-section panel:
 * `AssetLoadingSection` (the legacy slot-progress rows),
 * `GpuTimingsSection` (per-pass GPU timing live readout),
 * `RenderTogglesSection` (per-pass on/off checkboxes for visual
 * debugging), and `DataQualitySection` (catalog-audit diagnostics
 * such as the orientation-fallback toggles — see Q16g of the
 * 2026-05-19 SettingsPanel UX audit for why these graduated out
 * of the user-facing Settings panel).  The mount predicate is owned
 * by `App.tsx` (DEV || `hasUrlGate('debug')`); when this component
 * renders, all sections always render — section-level visibility
 * (e.g. "GPU timings unavailable") is each section's own concern.
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
import type { PassOverridesHandle } from '../../@types/engine/handles/EngineDebugHandle';
import { AssetLoadingSection } from './AssetLoadingSection';
import { GpuTimingsSection } from './GpuTimingsSection';
import { RenderTogglesSection } from './RenderTogglesSection';
import { DataQualitySection } from './DataQualitySection';

export type DebugPanelProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService;
  passOverrides: PassOverridesHandle;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  onHighlightFallbackChange: (enabled: boolean) => void;
  onRealOnlyModeChange: (enabled: boolean) => void;
};

export function DebugPanel({
  slots,
  timingService,
  passOverrides,
  highlightFallback,
  realOnlyMode,
  onHighlightFallbackChange,
  onRealOnlyModeChange,
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
      <RenderTogglesSection passOverrides={passOverrides} />
      <div style={{ marginTop: 6 }} />
      <DataQualitySection
        highlightFallback={highlightFallback}
        realOnlyMode={realOnlyMode}
        onHighlightFallbackChange={onHighlightFallbackChange}
        onRealOnlyModeChange={onRealOnlyModeChange}
      />
    </div>
  );
}
