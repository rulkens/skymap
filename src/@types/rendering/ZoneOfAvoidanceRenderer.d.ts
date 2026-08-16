/**
 * ZoneOfAvoidanceRenderer — public handle for the galactic-plane dust-band
 * guide layer's band pass. Draws a translucent shell between
 * `innerRadiusMpc` and `outerRadiusMpc`, centred at the world origin (the
 * catalog observer), masked to the galactic-latitude wedge the
 * `zoneOfAvoidanceBLimitDeg` formula describes.
 *
 * Same family as `HorizonShellRenderer`: a single, world-anchored impostor
 * whose fragment stage intersects each per-pixel view ray with the geometry
 * analytically, rather than rasterising a mesh.
 *
 * `drawLabels` draws the curved on-band "Zone of Avoidance" lettering —
 * discrete world-oriented MSDF glyph quads, a separate pipeline from the
 * band's fullscreen ray march (see zoneOfAvoidanceRenderer.ts's header).
 * `drawPick` reruns the SAME ray march against an r32uint pick target so a
 * click only registers where the band is actually visible.
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

  /**
   * Issue the curved-lettering instanced draw. `viewProj` is the
   * already-narrowed-to-f32 slab view-projection (`SlabView.vp`) — this
   * pass only ever projects world-fixed glyph corners, so it needs no
   * camera basis/ray reconstruction and takes the matrix directly rather
   * than an `OrbitCamera`, unlike `draw` above.
   *
   * `tuning.labelColor` is the lettering's tint (linear RGB); `labelRadiusMpc`
   * is the fixed radius (Mpc) of the galactic-plane circle the lettering
   * sits on; `fadeAlpha` is the caller's per-frame opacity
   * (`zoneOfAvoidanceLayerOpacity` composed with the `labelLayer`/
   * `zoneOfAvoidance` fade-registry entry — see `zoneOfAvoidanceLayer.ts`).
   * The glyph-instance buffer is built once at construction from
   * `layoutLabel`; this call only writes the small per-frame uniform and
   * issues one instanced draw.
   */
  drawLabels(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    labelRadiusMpc: number,
    fadeAlpha: number,
  ): void;
};
