/**
 * ZoneOfAvoidanceRenderer — public handle for the galactic-plane dust-band
 * guide layer's band pass. Draws a translucent shell between
 * `innerRadiusMpc` and `outerRadiusMpc`, centred at the world origin (the
 * catalog observer), masked to a galactic-latitude wedge whose half-width is
 * a cosine bump over longitude (`shaders/zoneOfAvoidance/band.wesl`).
 *
 * Same family as `HorizonShellRenderer`: a single, world-anchored impostor
 * whose fragment stage intersects each per-pixel view ray with the geometry
 * analytically, rather than rasterising a mesh. The curved "Zone of
 * Avoidance" lettering is a `Label3DProducer` drawn by the shared
 * `label3DRenderer`, not this renderer.
 * `drawPick` reruns the SAME ray march against an r32uint pick target so a
 * click only registers where the band's density is perceptible.
 */

import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { ViewFrustum } from '../../../@types/camera/ViewFrustum';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { PickWindow } from '../../../@types/engine/frame/PickWindow';
import type { ZoneOfAvoidanceTuning } from './ZoneOfAvoidanceTuning';
import type { ZoneOfAvoidanceShell } from './ZoneOfAvoidanceShell';
import type { Renderer } from '../../../@types/rendering/Renderer';

export type ZoneOfAvoidanceRenderer = Renderer & {
  /**
   * Issue the fullscreen-quad draw. Encodes the uniform write and a single
   * `draw(6, 1)` call. The rays span `cam`'s basis by `frustum`, the view's.
   *
   * `shell` bounds the visible radii and the longitude-dependent
   * latitude-limit curve; `fadeAlpha` is the caller's per-frame opacity
   * (the handed value, distance band included) — the
   * fragment shader multiplies it into the additive contribution alongside
   * `tuning.intensity`.
   */
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    frustum: ViewFrustum,
    tuning: ZoneOfAvoidanceTuning,
    shell: ZoneOfAvoidanceShell,
    fadeAlpha: number,
  ): void;

  /**
   * Pick twin of `draw`, issued against the r32uint pick pipeline. The rays
   * are the canvas's (`frustum`); the target covers only `window`, a
   * rectangle of the `canvasPx` canvas.
   */
  drawPick(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    frustum: ViewFrustum,
    canvasPx: Vec2,
    window: PickWindow,
    tuning: ZoneOfAvoidanceTuning,
    shell: ZoneOfAvoidanceShell,
    fadeAlpha: number,
  ): void;
};
