/**
 * orbitDragDelta — pointer-drag delta, scaled to a yaw/pitch rotation. The one
 * piece of orbit-camera drag math identical across galaxy-renderer,
 * flow-workbench and mcpm-workbench's hand-rolled input handlers. Everything
 * downstream of this multiply differs per tool on purpose (which axis calls
 * itself "az" vs "yaw", the sign a rightward drag applies, pitch clamping) —
 * this function stays sign-agnostic so each caller keeps its own convention.
 */
export type OrbitDragDelta = {
  readonly dYaw: number;
  readonly dPitch: number;
};

export function orbitDragDelta(
  dxPx: number,
  dyPx: number,
  dragSpeedRadPerPx: number,
): OrbitDragDelta {
  return { dYaw: dxPx * dragSpeedRadPerPx, dPitch: dyPx * dragSpeedRadPerPx };
}
