/**
 * captureFaceViewId — the `ViewSpec.id` of one cubemap capture face,
 * `<capture key>:<face>` (e.g. `sgrAStar:3`). Minted here and only here:
 * `faceViewSpec` stamps it onto the face's view; the capture's per-face
 * touch bookkeeping keys off the same string.
 */

import type { CubeFace } from '../../@types/rendering/CubeFace';
import type { CubemapCaptureKey } from '../../@types/rendering/CubemapCaptureKey';

export function captureFaceViewId(key: CubemapCaptureKey, face: CubeFace): string {
  return `${key}:${face}`;
}
