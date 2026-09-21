/**
 * ViewFrustum — frustum edges as tangents of the half-angles from the view
 * axis (OpenXR's "fov" form). Tangents, not one Mat4: every slab builds its
 * own projection from them with its own near/far.
 */
export type ViewFrustum = {
  readonly tanLeft: number; // ≤ 0 for a centred view
  readonly tanRight: number;
  readonly tanDown: number; // ≤ 0 for a centred view
  readonly tanUp: number;
};
