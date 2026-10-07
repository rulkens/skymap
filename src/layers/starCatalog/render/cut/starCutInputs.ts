import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import type { StarCutInputs } from '../../@types/StarCutInputs';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import {
  STAR_GLOW_MIN_PX,
  STAR_PICK_MIN_RADIUS_PX,
  STAR_SIZE_REF_PX,
} from '../../../../data/starCullSlack';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../utils/camera/frustumPlanesFromViewProj';
import { starExposureRamp } from '../../../../utils/star/starExposureRamp';
import { starSourcesInBand } from './starSourcesInBand';
import { FLOATS_PER_VIEW } from '../starCutLayout';

/**
 * This frame's GPU cut inputs, or `null` when no source is on and in band.
 * `views[0]` is the anchor — its eye is the cut's origin; every view's NEAR0
 * frustum is rebased about that origin in f64 (the cancellation discipline
 * `cutIo.wesl` keeps for node boxes) and the cut keeps a node any of them
 * sees. A view without a NEAR0 slab (a hand-built test ctx) ⇒ no prune.
 */
export function starCutInputs(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  settings: StarCatalogSettings,
  views: readonly FrameView[],
): StarCutInputs | null {
  const view = views[0]!;
  const originMpc: Vec3 = [view.drawCamPos[0], view.drawCamPos[1], view.drawCamPos[2]];
  const camDistMpc = Math.hypot(originMpc[0], originMpc[1], originMpc[2]);
  const inBand = starSourcesInBand(runtime, settings, camDistMpc * SCALE_UNITS.MPC_TO_PC);
  if (inBand.length === 0) return null;

  const prune = views.every((v) => v.slabs?.[NEAR0] !== undefined);
  const viewCount = prune ? views.length : 0;
  const planes = new Float32Array(viewCount * FLOATS_PER_VIEW);
  // The widest view (fewest pixels per radian) needs the most angular slack.
  let pxPerRad = Infinity;
  for (let v = 0; v < viewCount; v++) {
    const rebased = narrowMat4(rebaseViewProj(views[v]!.slabs[NEAR0]!.vp, originMpc));
    frustumPlanesFromViewProj(
      rebased,
      planes.subarray(v * FLOATS_PER_VIEW, (v + 1) * FLOATS_PER_VIEW),
    );
    pxPerRad = Math.min(pxPerRad, views[v]!.drawPxPerRad);
  }

  return {
    cut: {
      originMpc,
      planes,
      refineThreshold: settings.refineThreshold,
      worldSpread: Math.max(1, (settings.sizePx / STAR_SIZE_REF_PX) * settings.glowOverlap),
      // Pick, not leaf: the widest footprint any consumer paints.
      leafMarginRad:
        Math.max(STAR_GLOW_MIN_PX * (settings.sizePx / STAR_SIZE_REF_PX), STAR_PICK_MIN_RADIUS_PX) /
        pxPerRad,
      sources: inBand.map(({ source, entry, crossfade }) => ({
        source,
        opacity: crossfade,
        budgetTypical: entry.drawBudget.typical,
      })),
    },
    nowMs: view.snapshot.nowMs,
    sizePx: settings.sizePx,
    // DISPLAY exposure (see `starExposureRamp`), on the cut origin's distance.
    brightness:
      settings.brightness *
      starExposureRamp(
        camDistMpc,
        settings.exposureNearX,
        settings.exposureMidX,
        settings.exposureFarX,
      ),
    glowOverlap: settings.glowOverlap,
    aggregateIntensityCap: settings.aggregateIntensityCap,
  };
}
