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
import type { ZoneOfAvoidanceTuning } from '../settings/ZoneOfAvoidanceTuning';
import type { Renderer } from './Renderer';

export type ZoneOfAvoidanceRenderer = Renderer & {
  /**
   * Issue the fullscreen-quad draw. Encodes the uniform write and a single
   * `draw(6, 1)` call.
   *
   * `innerRadiusMpc` / `outerRadiusMpc` bound the visible shell;
   * `bulgeDeg` / `anticenterDeg` are the two ends of the longitude-dependent
   * latitude-limit curve; `fadeAlpha` is the caller's per-frame opacity
   * (`zoneOfAvoidanceLayerOpacity` composed with the fade registry) — the
   * fragment shader multiplies it into the additive contribution alongside
   * `tuning.intensity`.
   */
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    innerRadiusMpc: number,
    outerRadiusMpc: number,
    bulgeDeg: number,
    anticenterDeg: number,
    fadeAlpha: number,
  ): void;

  /**
   * Pick twin of `draw` — same args, same uniforms, issued against the
   * r32uint pick pipeline instead. Does not bind `@group(0)`: the COSMO
   * pick pass's shared camera prefix is already bound by the time this
   * runs (see `ContentLayer.drawPick`'s postcondition).
   */
  drawPick(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    innerRadiusMpc: number,
    outerRadiusMpc: number,
    bulgeDeg: number,
    anticenterDeg: number,
    fadeAlpha: number,
  ): void;
};
