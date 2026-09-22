/**
 * captureFaceViewId — the `ViewSpec.id` of one cubemap capture face,
 * `<capture key>:<face>` (e.g. `sgrAStar:3`). Minted here and only here:
 * `faceViewSpec` stamps it onto the face's view, and `timedSlotRowsOf`
 * rebuilds it from a step's `CaptureFaceRef` where no `FrameView` exists to
 * read `.id` off. The two must agree character for character or a face's
 * timing slots split in two.
 */

import type { CubeFace } from '../../@types/rendering/CubeFace';
import type { CubemapCaptureKey } from '../../@types/rendering/CubemapCaptureKey';

export function captureFaceViewId(key: CubemapCaptureKey, face: CubeFace): string {
  return `${key}:${face}`;
}
