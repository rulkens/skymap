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

import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Vec2 } from '../math/Vec2';
import type { PickWindow } from '../engine/frame/PickWindow';
import type { ZoneOfAvoidanceTuning } from '../settings/ZoneOfAvoidanceTuning';
import type { ZoneOfAvoidanceShell } from './ZoneOfAvoidanceShell';
import type { Renderer } from './Renderer';

export type ZoneOfAvoidanceRenderer = Renderer & {
  /**
   * Issue the fullscreen-quad draw. Encodes the uniform write and a single
   * `draw(6, 1)` call.
   *
   * `shell` bounds the visible radii and the longitude-dependent
   * latitude-limit curve; `fadeAlpha` is the caller's per-frame opacity
   * (`deriveZoneOfAvoidanceLiveness`: its distance bands × the handed value) — the
   * fragment shader multiplies it into the additive contribution alongside
   * `tuning.intensity`.
   */
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    shell: ZoneOfAvoidanceShell,
    fadeAlpha: number,
  ): void;

  /**
   * Pick twin of `draw`, issued against the r32uint pick pipeline. The rays
   * are the canvas's (`canvasPx` sets the aspect); the target covers only
   * `window`, a canvas-px rectangle.
   */
  drawPick(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    canvasPx: Vec2,
    window: PickWindow,
    tuning: ZoneOfAvoidanceTuning,
    shell: ZoneOfAvoidanceShell,
    fadeAlpha: number,
  ): void;
};
