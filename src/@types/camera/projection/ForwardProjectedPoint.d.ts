/**
 * Mutable out-param for `forwardProjectPoint` — one instance reused across a
 * call (or, for a per-label loop, across the whole loop), so the primitive
 * itself allocates nothing. `screenX`/`screenY`/`onScreen` are stale (not
 * reset) whenever `clipW <= 0`: every caller checks `clipW` first, matching
 * "no screen position" for a point on/behind the camera plane.
 */
export type ForwardProjectedPoint = {
  clipX: number;
  clipY: number;
  clipZ: number;
  clipW: number;
  screenX: number;
  screenY: number;
  /** Whether the NDC xy lands inside `[-1, 1]` — only meaningful when `clipW > 0`. */
  onScreen: boolean;
};
