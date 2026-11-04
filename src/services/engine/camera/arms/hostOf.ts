/** The body a frame's numbers are expressed against, or null when it is unresolvable this instant —
 *  the arm tree's one host policy, since a fallback body here is a teleport. PREMISE, unenforced:
 *  every roster id carries a derived body state, so the null is unreachable at the four sites that
 *  degrade quietly without it — `projectFramePose`'s tilt host (re-keys the tilt), `frameContext`
 *  provider B, `cameraDofAnglesOf` (drops the id), `replayInput` (swallows the step). */

import type { HostBody } from '../../../../@types/camera/HostBody';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { CameraArmBasisCtx } from '../../../../@types/camera/CameraArmBasisCtx';
import { rowFor } from './rowFor';

export function hostOf(frame: PoseFrame, ctx: CameraArmBasisCtx): HostBody | null {
  return rowFor(frame).host(frame, ctx);
}
