import type { Handle } from './Handle';
import type { RingHandle } from './RingHandle';

/** Every gizmo handle for one GridBox, world-space, from `gizmoHandleGeometry`. `resize` orders
 *  its six faces axis-major, sign within each axis: `[+x,-x,+y,-y,+z,-z]`. */
export type GizmoHandleGeometry = {
  readonly translate: readonly [Handle, Handle, Handle]; // one per axis
  readonly resize: readonly [Handle, Handle, Handle, Handle, Handle, Handle]; // one per face, ±axis order
  readonly rotate: readonly [RingHandle, RingHandle, RingHandle]; // one per axis
};
