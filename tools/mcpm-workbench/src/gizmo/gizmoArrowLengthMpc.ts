import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Translate-arrow reach as a fraction of viewport height — Blender's constant on-screen gizmo.
const ARROW_SCREEN_HEIGHT_FRACTION = 0.12;

/**
 * gizmoArrowLengthMpc — world-space translate-arrow length holding a constant on-screen size:
 * the frustum-slice formula `2·dist·tan(fovY/2)` (viewport height in world units at the box
 * center's depth) times the fraction above. Pick and draw call sites MUST feed this the same
 * camera each frame, or grabbing an arrow will miss where it's actually drawn.
 */
export function gizmoArrowLengthMpc(
  eyeMpc: Readonly<Vec3>,
  boxCenterMpc: Readonly<Vec3>,
  fovYRad: number,
): number {
  const dx = boxCenterMpc[0] - eyeMpc[0];
  const dy = boxCenterMpc[1] - eyeMpc[1];
  const dz = boxCenterMpc[2] - eyeMpc[2];
  const distToBoxCenter = Math.hypot(dx, dy, dz);

  return ARROW_SCREEN_HEIGHT_FRACTION * 2 * distToBoxCenter * Math.tan(fovYRad / 2);
}
