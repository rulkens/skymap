/**
 * orbitDragDelta — pointer-drag delta scaled to a yaw/pitch rotation, the one
 * piece of orbit-camera drag math identical across galaxy-renderer,
 * flow-workbench and mcpm-workbench's hand-rolled input handlers; sign and
 * axis-naming stay each caller's own convention. Per-tool drag speed also
 * deliberately differs, not a value to converge: 0.006 rad/px galaxy-renderer
 * vs 0.005 flow-workbench/mcpm-workbench.
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
