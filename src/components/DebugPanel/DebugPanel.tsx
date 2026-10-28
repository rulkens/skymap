/**
 * DebugPanel — the umbrella for the dev panel, mounted on the `d` shortcut.
 * `memo` is load-bearing: it is the panel's boundary, so an unrelated App
 * re-render doesn't cascade into every section's store reads.
 */

import { memo } from 'react';
import type { RefObject } from 'react';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { FrameStats } from '../../@types/engine/FrameStats';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import { APP_COMPOSITION } from '../../compositions/app';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import AssetLoadingSection from './AssetLoadingSection';
import { FrameStatsRow } from './FrameStatsRow';
import { GpuTimingsSection } from './GpuTimingsSection';
import MemorySectionContainer from '../containers/MemorySectionContainer';
import TerrainPickMarkerTuningSectionContainer from '../containers/TerrainPickMarkerTuningSectionContainer';
import CameraStateSectionContainer from '../containers/CameraStateSectionContainer';
import RenderTogglesSectionContainer from '../containers/RenderTogglesSectionContainer';
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
  /** Fetch rank per slot name (`debug.assetPriorities`); a getter because slots are minted after the handle is built. */
  assetPriorities: () => ReadonlyMap<string, number>;
  /** Threaded to the sections that read engine-only data (`debug.cameraDebug`, `debug.gpuMemory`). */
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
      <FrameStatsRow frameStats={frameStats} />
      <GpuTimingsSection service={timingService} />
      <MemorySectionContainer engineHandleRef={engineHandleRef} />
      <CameraStateSectionContainer engineHandleRef={engineHandleRef} />
      <RenderTogglesSectionContainer passNames={passNames} />
      {layerUiContents(APP_COMPOSITION.layers, 'debug').map((Section, index) => (
        <Section key={index} />
      ))}
      <DebugOverlaysSectionContainer />
      <TerrainPickMarkerTuningSectionContainer engineHandleRef={engineHandleRef} />
      <GalaxyProvenanceSectionContainer />
      <ClipTriggersSectionContainer />
      <ClipPathInspectorSectionContainer />
    </div>
  );
}

export default memo(DebugPanel);
