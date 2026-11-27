/**
 * detailRegionPlanner — once per frame in PRELUDE, before the per-view accumulation and march read
 * its value: a dome's faces share one region, keyed by the anchor eye. Region bookkeeping lives here
 * and not in the pass's draw because the accumulation cap stops drawing at rest, and the bricks
 * must still stream (spec §6.4).
 */
import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { CosmicWebDensityRuntime } from '../../@types/CosmicWebDensityRuntime';
import { COSMIC_WEB_DENSITY_TARGET_SCALE } from '../../densityCubes/data/cosmicWebDensityTargetScale';
import { DENSITY_REGION_BRICKS_BY_TIER } from '../../densityCubes/data/densityRegionBricksByTier';
import { densityFadeOpacityOf } from '../../densityCubes/present/densityFadeOpacityOf';
import { clampVolumeIntensity } from '../../densityCubes/utils/clampVolumeIntensity';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../sources/cosmicWebDensitySourceRows';
import type { DetailRegionFrame } from '../@types/DetailRegionFrame';

export function detailRegionPlanner(
  runtime: CosmicWebDensityRuntime,
): Extract<FrameContentPlanner<DetailRegionFrame, 'cosmicWebDensity'>, { scope: 'once' }> {
  return {
    name: 'cosmic-web-density-region',
    scope: 'once',
    fade: 'cosmicWebDensity',
    plan(snapshot, views, state, fade) {
      const opacityOf = densityFadeOpacityOf(snapshot, fade);
      const k = DENSITY_REGION_BRICKS_BY_TIER[state.tier];
      const wanted = new Map(
        COSMIC_WEB_DENSITY_SOURCE_ROWS.filter(
          (row) =>
            row.storage === 'pyramid' &&
            opacityOf(row.id) > 0 &&
            clampVolumeIntensity(state.settings.cosmicWebDensity.items[row.id].intensity) > 0 &&
            runtime.slots[row.id].committed() !== null,
        ).map((row) => [row.id, k]),
      );
      const anchor = views[0]!;
      const gatePxPerRad = Math.max(
        ...views.map((view) => view.drawPxPerRad / COSMIC_WEB_DENSITY_TARGET_SCALE),
      );
      const value = runtime.regions.frame(
        wanted,
        anchor.drawCamPos,
        gatePxPerRad,
        state.frameIndex,
        snapshot.nowMs,
      );
      // As planVolumeAccumulation: motion never holds settled(), a shot at rest waits for the region.
      return {
        value,
        awake: value.busy,
        settling: false,
        loading: value.busy && anchor.stillFrames > 0,
      };
    },
  };
}
