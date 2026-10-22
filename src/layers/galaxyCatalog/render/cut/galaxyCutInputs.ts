import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { GalaxyCatalogId } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogSourceEntry } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyCatalogSettings } from '../../../../@types/settings/GalaxyCatalogSettings';
import type { OctreeCutInputs } from '../../../../@types/octree/OctreeCutInputs';
import type { OctreeCutSourceInput } from '../../../../@types/octree/OctreeCutSourceInput';
import type { GalaxyCatalogRuntime } from '../../@types/GalaxyCatalogRuntime';
import { COSMO } from '../../../../services/engine/frame/slabs';
import { FLOATS_PER_VIEW, HALF_DIAGONAL } from '../../../../services/gpu/octree/octreeCutLayout';
import { SOURCE_REGISTRY } from '../../../../data/sources';
import { PICK_PADDING_PX } from '../../../../data/pickPaddingPx';
import { galaxyCatalogIdOf } from '../../../../utils/galaxyCatalogIdOf';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../utils/camera/frustumPlanesFromViewProj';

/**
 * This frame's galaxy cut inputs, or `null` when no committed octree source has a value
 * above 0. `views[0]`'s eye is the cut's origin and every view's COSMO frustum is rebased
 * about it, as `starCutInputs` does for NEAR0. Each source draws at its COMMITTED tier's
 * budget: during a tier reload the old pool keeps drawing at the budget it was installed at.
 */
export function galaxyCutInputs(
  runtime: Pick<GalaxyCatalogRuntime, 'octreePoints'>,
  settings: Pick<GalaxyCatalogSettings, 'sizePx' | 'refineThreshold' | 'blobGlowOverlap'>,
  fade: Readonly<Record<GalaxyCatalogId, number>>,
  views: readonly FrameView[],
): OctreeCutInputs | null {
  const sources: OctreeCutSourceInput[] = [];
  for (const [source, slot] of runtime.octreePoints) {
    const tier = slot.committed()?.req.tier;
    if (tier === undefined || !(fade[galaxyCatalogIdOf(source)] > 0)) continue;
    const entry: GalaxyCatalogSourceEntry = SOURCE_REGISTRY[source];
    const budget = entry.octree?.budgets[tier].drawBudget;
    // The source fade is the fragment's; the cut's own opacity channel stays 1.
    if (budget !== undefined) sources.push({ source, opacity: 1, drawBudget: budget });
  }
  if (sources.length === 0) return null;

  const view = views[0]!;
  const originMpc: Vec3 = [view.drawCamPos[0], view.drawCamPos[1], view.drawCamPos[2]];
  const planes = new Float32Array(views.length * FLOATS_PER_VIEW);
  // The widest view (fewest pixels per radian) needs the most angular slack.
  let pxPerRad = Infinity;
  for (let v = 0; v < views.length; v++) {
    const rebased = narrowMat4(rebaseViewProj(views[v]!.slabs[COSMO]!.vp, originMpc));
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
      // A blob's glow reaches half its box edge times the overlap; the cut's sphere is
      // the half diagonal times this.
      worldSpread: Math.max(1, (0.5 * settings.blobGlowOverlap) / HALF_DIAGONAL),
      // The pick footprint, the widest dot any consumer paints.
      leafMarginRad: (settings.sizePx + PICK_PADDING_PX) / pxPerRad,
      sources,
    },
    nowMs: view.snapshot.nowMs,
  };
}
