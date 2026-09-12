/**
 * DebugPanel — the umbrella for the dev panel, mounted by `App.tsx` on the `d`
 * shortcut. Every section that touches the store owns its own container, so this
 * component takes only the engine-handle props App reads off `handleRef`, and
 * section-level visibility is each section's own concern.
 *
 * `memo` is load-bearing: this is App's memo boundary for the panel, so an
 * unrelated App re-render doesn't cascade into every section's store reads.
 */

import { memo } from 'react';
import type { RefObject } from 'react';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FrameStats } from '../../@types/engine/FrameStats';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import AssetLoadingSection from './AssetLoadingSection';
import { FrameStatsRow } from './FrameStatsRow';
import { GpuTimingsSection } from './GpuTimingsSection';
import EarthTileAtlasSectionContainer from '../containers/EarthTileAtlasSectionContainer';
import CameraStateSectionContainer from '../containers/CameraStateSectionContainer';
import RenderTogglesSectionContainer from '../containers/RenderTogglesSectionContainer';
import FlowTuningSectionContainer from '../containers/FlowTuningSectionContainer';
import MilkyWayTuningSectionContainer from '../containers/MilkyWayTuningSectionContainer';
import ZoneOfAvoidanceTuningSectionContainer from '../containers/ZoneOfAvoidanceTuningSectionContainer';
import SgrAStarLensingTuningSectionContainer from '../containers/SgrAStarLensingTuningSectionContainer';
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
  /**
   * Authored `ASSET_WIRING` fetch rank per slot name, from the engine handle's
   * `debug.assetPriorities`. A getter, not a Map, because slots are minted by
   * the async bootstrap long after the handle is built.
   */
  assetPriorities: () => ReadonlyMap<string, number>;
  /** Engine-handle ref, threaded to `EarthTileAtlasSectionContainer` for its `debug.earthTiles` / `debug.flyToLonLat` reach. */
  engineHandleRef: RefObject<EngineHandle | null>;
};

function DebugPanel({
  slots,
  timingService,
  frameStats,
  passNames,
  assetPriorities,
  engineHandleRef,
}: DebugPanelProps) {
  return (
    <div className={styles.root}>
      <div className={styles.title}>Skymap Debug</div>
      <AssetLoadingSection slots={slots} assetPriorities={assetPriorities} />
      {/* Always shown — its numbers need no GPU query, so it sits above the
          GPU timings section, which is dark without `?gpuTimings`. */}
      <FrameStatsRow frameStats={frameStats} />
      <GpuTimingsSection service={timingService} />
      <CameraStateSectionContainer engineHandleRef={engineHandleRef} />
      <RenderTogglesSectionContainer passNames={passNames} />
      <FlowTuningSectionContainer />
      <MilkyWayTuningSectionContainer />
      <ZoneOfAvoidanceTuningSectionContainer />
      <SgrAStarLensingTuningSectionContainer />
      <DebugOverlaysSectionContainer />
      <EarthTileAtlasSectionContainer engineHandleRef={engineHandleRef} />
      <GalaxyProvenanceSectionContainer />
      <ClipTriggersSectionContainer />
      <ClipPathInspectorSectionContainer />
    </div>
  );
}

export default memo(DebugPanel);
