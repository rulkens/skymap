/**
 * DebugPanel — the umbrella for the renamed dev panel.
 *
 * Replaces the legacy `LoadingDevPanel` with a two-section panel:
 * `AssetLoadingSection` (the legacy slot-progress rows) and
 * `GpuTimingsSection` (per-pass GPU timing live readout).  The
 * mount predicate is owned by `App.tsx` (DEV ||
 * `hasUrlGate('debug')`); when this component renders, both
 * sections always render — section-level visibility (e.g. "GPU
 * timings unavailable") is each section's own concern.
 *
 * ### Why both sections collapsible
 *
 * The asset-loading rows churn during startup (every catalog,
 * filaments, the font atlas, etc.), but go quiet once everything
 * is `ready` — a collapsed `<details>` keeps the panel compact
 * during steady-state runs.  GPU timings is the opposite (always
 * live), but the user might want to focus on one or the other.
 * Both sections default to open; the user collapses them at will.
 */

import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import { AssetLoadingSection } from './AssetLoadingSection';
import { GpuTimingsSection } from './GpuTimingsSection';

export type DebugPanelProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService | null;
};

export function DebugPanel({ slots, timingService }: DebugPanelProps) {
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
      <div style={{ fontWeight: 'bold', marginBottom: 6, opacity: 0.8 }}>
        Skymap Debug
      </div>
      <AssetLoadingSection slots={slots} />
      <div style={{ marginTop: 6 }} />
      <GpuTimingsSection service={timingService} />
    </div>
  );
}
