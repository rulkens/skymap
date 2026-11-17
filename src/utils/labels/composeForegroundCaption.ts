/**
 * composeForegroundCaption — the per-caption compose every NEAR0 caption producer
 * shares: reveal → overflow → declutter priority → occlusion → `occludeNearKm` → lift.
 * `fade` is the caller's: the per-item value core hands its label entry (switch,
 * fade, clip and the entry's distance bands already folded in), so nothing here
 * reads the registry or decides a caption's reach.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { Label2D } from '../../@types/rendering/Label2D';
import type { CaptionComposeContext } from '../../@types/rendering/CaptionComposeContext';
import type { ForegroundCaption } from '../../services/engine/presentation/foregroundCaption';
import { isPickableUnderFocus } from '../structure/isPickableUnderFocus';
import { CAPTION_PRIORITY_SCALE } from '../../data/labels/captionPriorityScale';
import { apparentSizePx } from '../math/apparentSizePx';
import { fadeBand } from '../math/fadeBand';
import { overflowFade } from '../scene/overflowFade';
import { subjectOccludedByBodies } from '../occlusion/subjectOccludedByBodies';
import { subjectWithinRelief } from '../occlusion/subjectWithinRelief';
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

  const revealAlpha = label.revealBand === undefined ? 1 : fadeBand(label.revealBand, distanceMpc);
  const fadeAlpha = revealAlpha * overflowFade(subjectSizePx, ctx.viewportShortSidePx) * fade;

  const declutterPriority =
    label.priority * CAPTION_PRIORITY_SCALE + Math.min(subjectSizePx, CAPTION_PRIORITY_SCALE - 1);

  // A name is a click target for its subject, so it leaves the pick with it:
  // nothing the focus dims is selectable.
  const pickable = isPickableUnderFocus(label.worldPos, ctx.focus);

  return {
    ...label,
    pickId: pickable ? label.pickId : undefined,
    subjectId: label.pickId,
    worldPos: anchor,
    fadeAlpha,
    occludeWeight: subjectOccludedByBodies({
      subjectMpc: label.worldPos,
      camPosMpc: ctx.camPos,
      bodies: ctx.occluders,
    })
      ? 1
      : 0,
    // The sampled-depth channel asks whether the scene at the subject's pixel
    // stands nearer than the subject. For a sub-pixel subject ON a body's ground,
    // that pixel is one terrain texel spanning kilometres and the baked site height
    // sits inside its LOD error, so the answer is noise (rover captions flickered
    // over Mars); a negative cutoff is the shader's "never", leaving the sphere
    // test to decide. Off the ground the answer is sound and must stay: the
    // inner-bound sphere misses the last degrees above it, where only terrain
    // depth hides a star below a rover's horizon.
    occludeNearKm:
      subjectSizePx < 1 && subjectWithinRelief(label.worldPos, ctx.occluders)
        ? -1
        : (distanceMpc - label.worldEmMpc) * SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM,
    declutterPriority,
    lift: {
      subjectSizePx,
      lineBottomLiftPx: subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX * ctx.devicePixelRatio,
    },
  };
}
