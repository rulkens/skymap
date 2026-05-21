/**
 * HorizonShellRenderer — public handle for the observable-universe
 * horizon-shell pass.  Renders a translucent spherical mesh centred at
 * the world origin (the catalog observer) with a Fresnel-rim fragment
 * shader, marking the comoving radius to the cosmic particle horizon.
 *
 * Sibling to `MilkyWayRenderer` (also a single, world-anchored impostor),
 * but with real 3D geometry — a baked UV-sphere VBO + IBO — because we
 * need the silhouette to track the camera's orbit, not stay screen-
 * aligned.
 */

import type { OrbitCamera } from '../camera/OrbitCamera';

export type HorizonShellRenderer = {
  /** Human-readable identifier (`'horizonShellRenderer'`). */
  readonly label: string;
  /**
   * Issue the fullscreen-quad draw.  Encodes the uniform write and a
   * single `draw(6, 1)` call.  The shell is a sphere of fixed radius
   * (the comoving particle-horizon distance) centred at the world
   * origin, intersected analytically per-pixel; the renderer derives
   * the camera basis + FOV from `cam` to build the view rays.
   */
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: [number, number],
  ): void;
  /** Release the GPU buffers backing the uniform block. */
  destroy(): void;
};
