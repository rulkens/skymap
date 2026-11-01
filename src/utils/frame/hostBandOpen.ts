/**
 * hostBandOpen — the ONE rule for whether a slab row hosts a banded line in
 * this view (`SlabRow.hosts`). Measured off `ctx.bodyPose`, the pose the
 * body passes draw with, so the atmosphere shell's `inside` and the aerial
 * line's row cannot disagree at the edge. Mpc, like every `FadeBand`.
 */

import type { FadeBand } from '../../@types/math/FadeBand';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PositionedId } from '../../@types/scene/PositionedId';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { fadeBand } from '../math/fadeBand';

export function hostBandOpen(
  band: FadeBand | undefined,
  ctx: FrameView,
  anchorId: PositionedId,
): boolean {
  if (band === undefined) return true;
  const pose = ctx.bodyPose(anchorId);
  if (pose === null) return false;
  const [x, y, z] = pose.eyeRelBodyM;
  return fadeBand(band, Math.hypot(x, y, z) * SCALE_UNITS.M_TO_MPC) > 0;
}
