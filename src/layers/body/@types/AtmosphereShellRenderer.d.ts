/**
 * AtmosphereShellRenderer: Earth's in-scatter atmosphere, a translucent shell just
 * outside the cloud shell. Three `rgba16float` LUTs: transmittance then
 * multi-scatter baked once in one encoder, sky-view baked every frame.
 * The shell draws BOTH walls (`cullMode: 'none'`); the fragment splits duty by
 * `@builtin(front_facing)` and classifies rays by SAMPLED `foreground:0` depth, so
 * the pipeline declares no depth state. One bundle (LUTs, uniform buffers, bind
 * groups) per `paramsById` row, so per-frame writes never share a buffer.
 * Pipelines use explicit layouts, never `layout: 'auto'`.
 */

import type { AtmosphereShellDepth } from './AtmosphereShellDepth';
import type { Renderer } from '../../../@types/rendering/Renderer';

export type AtmosphereShellRenderer = Renderer & {
  /**
   * Regenerate body `bodyId`'s per-frame sky-view LUT into its own texture, as
   * one dispatch into the CALLER's open compute pass (`encodeAtmosphereSkyView`
   * opens it in the frame's prelude, before the foreground render pass). Writes
   * `skyViewUniforms` to that body's `SkyViewParams` buffer first, then
   * dispatches. THROWS on an unknown `bodyId` (a programming error — callers
   * only pass `atmosphereDrawList` ids, which come from the same table this
   * renderer bundles).
   *
   * The caller owns the pass, so the whole bake bills ONE GPU-timing slot.
   *
   * `skyViewUniforms` is the 16-byte (4 x f32) `SkyViewParams` record, written
   * VERBATIM:
   *   f32 0 viewHeightKm: camera radius from the planet centre in KM; must equal
   *         `|camPosLocal| x atmosphereTopKm` (the LUTs are ratio-parametrised).
   *   f32 1 sunZenithCos: `dot(normalize(camPosLocal), sunDirLocal)`.
   *   f32 2 twilightSoftness: night-limb sun-fade width in mu (cos-zenith).
   *   f32 3 twilightIntensity: brightness gain on the twilight band.
   * Both twilight values come from the body's `AtmosphereParams` row.
   */
  dispatchSkyView(pass: GPUComputePassEncoder, bodyId: string, skyViewUniforms: Float32Array): void;

  /**
   * Upload the host body's ring-alpha strip at binding 4, replacing the 1x1
   * transparent placeholder, so a ring in FRONT of the atmosphere is not darkened
   * by the shell's over-blend. A `bodyId` with no atmosphere bundle is a NO-OP
   * (the ring link is optional by data), unlike `draw`'s throw.
   */
  setRingTexture(bodyId: string, bitmap: ImageBitmap): void;

  /**
   * Draw body `bodyId`'s shell into the open foreground pass as TWO draws:
   * MULTIPLY (extinction of the destination) then ADD (in-scatter); the order is
   * load-bearing. OUTSIDE the atmosphere top only; inside it, use
   * `drawAerialPerspective`. `uniforms` is the 176-byte record from
   * `packAtmosphereUniforms`. THROWS on an unknown `bodyId`.
   *
   * `depth.view` keys the body's bind group, so a new view (after a
   * `renderTargets` reallocation) rebuilds it rather than pointing at a
   * destroyed texture.
   */
  draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depth: AtmosphereShellDepth,
  ): void;

  /**
   * Bake body `bodyId`'s camera-local froxel volumes into the caller's compute
   * pass (delegated to `AerialPerspectiveRenderer`). `uniforms` is the same record
   * `draw` takes, and this is its only write for an inside-the-shell body.
   */
  bakeAerialPerspective(pass: GPUComputePassEncoder, bodyId: string, uniforms: Float32Array): void;

  /**
   * Fog the open pass from inside body `bodyId`'s shell (delegated to
   * `AerialPerspectiveRenderer`). Reads the record `bakeAerialPerspective` wrote
   * this frame; `depthView` is `foreground:0`'s depth as a sampled texture.
   */
  drawAerialPerspective(
    pass: GPURenderPassEncoder,
    bodyId: string,
    depthView: GPUTextureView,
  ): void;

  /**
   * Called once per frame with the live tier's sky-view LUT texel size. No-op when
   * unchanged; otherwise every bundle's `skyViewTex` is recreated, `shellBindGroup`
   * is nulled and rebuilt lazily at the next draw (it also binds a depth view), and
   * the aerial renderer's apply entries are rebound.
   */
  reconcile(config: { readonly skyViewLutSize: readonly [number, number] }): void;
};
