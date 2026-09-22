/**
 * captureFaceViewId — the one minting of a cubemap face's view id,
 * `<capture key>:<face>`. `faceViewSpec` stamps it onto the face's `ViewSpec`;
 * `timedSlotRowsOf` rebuilds it from a step's `CaptureFaceRef`, where no real
 * `FrameView` exists to read `.id` off, so the two must agree character for
 * character or a face's timing slots split in two.
 */

import type { CubeFace } from '../../@types/rendering/CubeFace';
import type { CubemapCaptureKey } from '../../@types/rendering/CubemapCaptureKey';

export function captureFaceViewId(key: CubemapCaptureKey, face: CubeFace): string {
  return `${key}:${face}`;
}
