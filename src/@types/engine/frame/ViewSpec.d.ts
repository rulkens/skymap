/**
 * ViewSpec — one view of the frame's camera: the same pose and arm, turned
 * and offset in the camera's own image-plane basis, through its own frustum.
 * `deriveView` turns one into a `FrameView`.
 */

import type { Mat3 } from '../../math/Mat3';
import type { Vec3 } from '../../math/Vec3';
import type { Size } from '../../rendering/Size';
import type { ViewFrustum } from '../../camera/ViewFrustum';
import type { ViewKind } from './ViewKind';

export type ViewSpec = {
  /** View right | up | forward as columns, in the camera's right | up | forward basis. */
  readonly rotation: Readonly<Mat3>;
  /** Eye offset from the camera eye, in the ROTATED view basis. */
  readonly eyeOffsetMpc: Vec3;
  readonly frustum: ViewFrustum;
  readonly sizePx: Size;
  /** View-slot uniform ring index — see `FrameView.viewSlot`. */
  readonly slot: number;
  /** What the view renders — a capture face says so here rather than being
   *  patched after the fact. See `ViewKind`. */
  readonly kind: ViewKind;
  /** Where this view's `swap` resolves; absent = the canvas. */
  readonly output?: GPUTextureView;
  /** WebGPU rasterizes top-left; a capture face's basis table is the GL
   *  bottom-left convention, which no rotation can absorb — only a capture
   *  sets this. `deriveView` applies it at every projection it builds (the
   *  view's own vp and each slab's), so nothing post-mutates its output. */
  readonly clipYFlip?: true;
};
