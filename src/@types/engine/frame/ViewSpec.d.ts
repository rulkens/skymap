/**
 * ViewSpec — one view of the frame's camera: the same pose and arm, turned
 * and offset in the camera's own image-plane basis, through its own frustum.
 * `deriveViewContext` turns one into a whole `ReadyFrameContext`.
 */

import type { Mat3 } from '../../math/Mat3';
import type { Vec3 } from '../../math/Vec3';
import type { Size } from '../../rendering/Size';
import type { ViewFrustum } from '../../camera/ViewFrustum';

export type ViewSpec = {
  /** View right | up | forward as columns, in the camera's right | up | forward basis. */
  readonly rotation: Mat3;
  /** Eye offset from the camera eye, in the ROTATED view basis. */
  readonly eyeOffsetMpc: Vec3;
  readonly frustum: ViewFrustum;
  readonly sizePx: Size;
  /** View-slot uniform ring index — see `ReadyFrameContext.viewSlot`. */
  readonly slot: number;
  /** Where this view's `swap` resolves; absent = the canvas. */
  readonly output?: GPUTextureView;
};
