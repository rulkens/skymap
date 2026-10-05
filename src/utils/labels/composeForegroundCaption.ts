/**
 * composeForegroundCaption — the per-caption compose `produceSceneBodyCaptions`
 * and `produceStarCaptions` each ran as their own copy: fade rule → registry
 * opacity → clip factor → overflow → prominence → occlusion → `occludeNearKm`
 * → lift. `clipFactor` is the caller's — core reads one key for every body,
 * the star Layer picks per caption between `bodyLabel`/`starCatalogLabel`.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { Label2D } from '../../@types/rendering/Label2D';
import type { CaptionComposeContext } from '../../@types/rendering/CaptionComposeContext';
import type { ForegroundCaption } from '../../services/engine/presentation/foregroundCaption';
import { CAPTION_FADE_RULES } from '../../services/engine/presentation/captionFadeRules';
import {
  CAPTION_PRIORITY,
  CAPTION_TIER_SCALE,
} from '../../services/engine/presentation/captionPriority';
import { apparentSizePx } from '../math/apparentSizePx';
import { fadeBand } from '../math/fadeBand';
import { overflowFade } from '../scene/overflowFade';
import { subjectOccludedByBodies } from '../occlusion/subjectOccludedByBodies';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { LEADER_LINE_BOTTOM_GAP_PX } from '../../services/engine/presentation/leaderLineStyle';

export function composeForegroundCaption(
  ctx: CaptionComposeContext,
  label: ForegroundCaption,
  clipFactor: number,
): Label2D {
  const anchor: Vec3 = [
    label.worldPos[0] - ctx.camPos[0],
    label.worldPos[1] - ctx.camPos[1],
    label.worldPos[2] - ctx.camPos[2],
  ];
  const distanceMpc = Math.hypot(anchor[0], anchor[1], anchor[2]);
  const subjectSizePx = apparentSizePx({
    diameterKpc: (2 * label.worldEmMpc) / SCALE_UNITS.KPC_TO_MPC,
    distanceMpc,
    pxPerRad: ctx.drawPxPerRad,
  });

  const rule = CAPTION_FADE_RULES[label.kind];
  const registryOpacity =
    rule.fadeHandle === null ? 1 : ctx.fades.opacityOf(rule.fadeHandle, ctx.nowMs);
  const ruleGate =
    rule.subjectVisible(ctx.settings) && (rule.labelEnabled(ctx.settings) || registryOpacity > 0)
      ? 1
      : 0;
  const revealAlpha = label.revealBand === undefined ? 1 : fadeBand(label.revealBand, distanceMpc);
  const fadeAlpha =
    ruleGate *
    rule.fadeTarget(distanceMpc, ctx.camOrbitDistanceMpc) *
    revealAlpha *
    overflowFade(subjectSizePx, ctx.viewportShortSidePx) *
    registryOpacity *
    clipFactor;

  const prominencePx =
    CAPTION_PRIORITY[label.kind] * CAPTION_TIER_SCALE +
    Math.min(subjectSizePx, CAPTION_TIER_SCALE - 1);

  return {
    ...label,
    worldPos: anchor,
    fadeAlpha,
    occludeWeight: subjectOccludedByBodies({
      subjectMpc: label.worldPos,
      camPosMpc: ctx.camPos,
      bodies: ctx.occluders,
    })
      ? 1
      : 0,
    occludeNearKm: (distanceMpc - label.worldEmMpc) * SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM,
    prominencePx,
    lift: {
      subjectSizePx,
      lineBottomLiftPx: subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX,
    },
  };
}
