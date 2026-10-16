/**
 * composeForegroundCaption — the per-caption compose every NEAR0 caption producer
 * shares: fade rule → overflow → prominence → occlusion → `occludeNearKm` → lift.
 * `fade` is the caller's: the per-item value core hands its label entry (switch,
 * fade, recession and clip already folded in), so nothing here reads the registry.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { Label2D } from '../../@types/rendering/Label2D';
import type { CaptionComposeContext } from '../../@types/rendering/CaptionComposeContext';
import type { ForegroundCaption } from '../../services/engine/presentation/foregroundCaption';
import { isPickableUnderFocus } from '../structure/isPickableUnderFocus';
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
  fade: number,
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
  const revealAlpha = label.revealBand === undefined ? 1 : fadeBand(label.revealBand, distanceMpc);
  const fadeAlpha =
    rule.fadeTarget(distanceMpc, ctx.camOrbitDistanceMpc) *
    revealAlpha *
    overflowFade(subjectSizePx, ctx.viewportShortSidePx) *
    fade;

  const prominencePx =
    CAPTION_PRIORITY[label.kind] * CAPTION_TIER_SCALE +
    Math.min(subjectSizePx, CAPTION_TIER_SCALE - 1);

  // A name is a click target for its subject, so it leaves the pick with it:
  // nothing the focus dims is selectable.
  const pickable = isPickableUnderFocus(label.worldPos, ctx.focus);

  return {
    ...label,
    pickId: pickable ? label.pickId : undefined,
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
