/**
 * faceViewSpec — one cubemap face as a view of the capture's frame: a signed
 * permutation of the capture camera's own axes, 90° square. `axes`-free — the
 * capture's orientation lives in its camera, so the six specs are the same
 * whatever the row captures. `id` is `<key>:<face>` — the one place a capture
 * face's timing-slot suffix is minted (`timingSlotForView` reads it back off
 * `FrameView.id`).
 */

import type { CubeFace } from '../../@types/rendering/CubeFace';
import type { CubemapCaptureKey } from '../../@types/rendering/CubemapCaptureKey';
import type { ViewSpec } from '../../@types/engine/frame/ViewSpec';
import { FACE_VIEW_ROTATIONS } from '../../data/rendering/cubeFaceBases';
import { symmetricFrustum } from './symmetricFrustum';

export function faceViewSpec(
  key: CubemapCaptureKey,
  face: CubeFace,
  faceSizePx: number,
  viewSlotBase: number,
): ViewSpec {
  return {
    id: `${key}:${face}`,
    rotation: FACE_VIEW_ROTATIONS[face]!,
    eyeOffsetMpc: [0, 0, 0],
    frustum: symmetricFrustum(Math.PI / 2, 1),
    sizePx: { width: faceSizePx, height: faceSizePx },
    slot: viewSlotBase + face,
    kind: 'capture',
    clipYFlip: true,
  };
}
