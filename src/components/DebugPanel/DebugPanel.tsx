/**
 * DebugPanel — the umbrella for the dev panel.
 *
 * Sections: `AssetLoadingSection` (slot-progress rows),
 * `GpuTimingsSection` (per-pass GPU timing live readout),
 * `RenderTogglesSectionContainer` (per-pass on/off checkboxes for visual
 * debugging), `FlowTuningSectionContainer`, `DebugOverlaysSectionContainer`
 * (pick-buffer / disk-radius-ring toggles), `GalaxyProvenanceSectionContainer`
 * (a per-axis table of missing / highlight / show controls over measured-vs-
 * estimated tallies), and `ClipTriggersSectionContainer` (play/stop a registered clip
 * + launch a guided tour) / `ClipPathInspectorSectionContainer` (precompute +
 * scrub a clip's debug camera path) — every section that touches the store
 * owns its own container, so DebugPanel itself receives only the engine-handle
 * props (`slots`, `timingService`, `frameStats`, `passNames`) that App reads
 * off `handleRef`. Mount is owned by `App.tsx` (toggled by the `d` keyboard
 * shortcut); when this component renders, all sections always render —
 * section-level visibility (e.g. "GPU timings unavailable") is each section's
 * own concern.
 *
 * `memo` is load-bearing here: this is App's memo boundary for the panel, so
 * an unrelated App re-render doesn't cascade into every section's store reads.
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

import { memo } from 'react';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FrameStats } from '../../@types/engine/FrameStats';
import { AssetLoadingSection } from './AssetLoadingSection';
import { FrameStatsRow } from './FrameStatsRow';
import { GpuTimingsSection } from './GpuTimingsSection';
import RenderTogglesSectionContainer from '../containers/RenderTogglesSectionContainer';
import FlowTuningSectionContainer from '../containers/FlowTuningSectionContainer';
import DebugOverlaysSectionContainer from '../containers/DebugOverlaysSectionContainer';
import GalaxyProvenanceSectionContainer from '../containers/GalaxyProvenanceSectionContainer';
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
};

function DebugPanel({ slots, timingService, frameStats, passNames }: DebugPanelProps) {
  return (
    <div className={styles.root}>
      <div className={styles.title}>Skymap Debug</div>
      <AssetLoadingSection slots={slots} />
      {/* Always shown — its numbers need no GPU query, so it sits above the
          GPU timings section, which is dark without `?gpuTimings`. */}
      <FrameStatsRow frameStats={frameStats} />
      <GpuTimingsSection service={timingService} />
      <RenderTogglesSectionContainer passNames={passNames} />
      <FlowTuningSectionContainer />
      <DebugOverlaysSectionContainer />
      <GalaxyProvenanceSectionContainer />
      <ClipTriggersSectionContainer />
      <ClipPathInspectorSectionContainer />
    </div>
  );
}

export default memo(DebugPanel);
