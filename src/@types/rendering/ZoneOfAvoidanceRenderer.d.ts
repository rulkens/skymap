/**
 * ZoneOfAvoidanceRenderer — public handle for the galactic-plane dust-band
 * guide layer's band pass. Draws a translucent shell between
 * `innerRadiusMpc` and `outerRadiusMpc`, centred at the world origin (the
 * catalog observer), masked to the galactic-latitude wedge Task 3's
 * `zoneOfAvoidanceBLimitDeg` formula describes.
 *
 * Same family as `HorizonShellRenderer`: a single, world-anchored impostor
 * whose fragment stage intersects each per-pixel view ray with the geometry
 * analytically, rather than rasterising a mesh.
 *
 * `drawLabels` / `drawPick` are added by Tasks 10/12 — not stubbed here.
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
};
