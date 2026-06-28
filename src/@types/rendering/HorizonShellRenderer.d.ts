/**
 * HorizonShellRenderer — public handle for the observable-universe
 * horizon-shell pass.  Draws a translucent sphere centred at the world
 * origin (the catalog observer) with a Fresnel-rim fragment shader,
 * marking the comoving radius to the cosmic particle horizon.
 *
 * Sibling to `MilkyWayRenderer` (also a single, world-anchored impostor).
 * Rather than a tessellated mesh — which suffers fp32 dropouts at the
 * 14-Gpc shell radius — the shell is one fullscreen quad whose fragment
 * stage intersects each per-pixel view ray with the sphere analytically,
 * so the silhouette is pixel-perfect and tracks the camera's orbit.
 */

import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Vec2 } from '../math/Vec2';

export type HorizonShellRenderer = {
  /** Human-readable identifier (`'horizonShellRenderer'`). */
  readonly label: string;
  /**
   * Issue the fullscreen-quad draw.  Encodes the uniform write and a
   * single `draw(6, 1)` call.  The shell is a sphere of fixed radius
   * (the comoving particle-horizon distance) centred at the world
   * origin, intersected analytically per-pixel; the renderer derives
   * the camera basis + FOV from `cam` to build the view rays.
   *
   * `fadeAlpha` is the distance-fade in `[0, 1]` (see
   * `utils/math/horizonShellFadeAlpha`); the fragment shader multiplies it
   * into the additive contribution so the shell ramps in with pull-back.
   */
  draw(pass: GPURenderPassEncoder, cam: OrbitCamera, viewport: Vec2, fadeAlpha: number): void;
  /** Release the GPU buffers backing the uniform block. */
  destroy(): void;
};
