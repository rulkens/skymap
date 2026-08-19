/**
 * EarthRenderer — handle for the true-scale, texture-mapped Earth drawn into
 * the opaque near-field foreground target.
 *
 * The Earth is a cube-sphere mesh (`cubeSphereMesh`), shaded by the shared
 * physically-based microfacet core (`lib/pbr.wesl`'s `pbrDirect`): an
 * equirectangular Blue Marble albedo plus a co-registered linear material map
 * (roughness + ocean mask) that gives the ocean its sun glint, over the
 * sun-relative light direction, with the shared `AMBIENT` floor. It binds
 * `lib/sphere.wesl`'s `EarthSurfaceUniforms` (128-byte block: the 80-byte
 * `LitBodyUniforms` prefix — mat4x4<f32> MVP + body-local sun direction — plus
 * the camera in the body's local frame and the PBR params, including the
 * user-tunable night-side ambient floor and open-water roughness) and
 * `clip_from_local`, so the CPU-side matrix layout and the GPU-side projection
 * stay a single source of truth across every sphere-shaped body.
 *
 * ### Texture lifecycle
 *
 * The Blue Marble bitmap is fetched by the proximity-gated `bodyTextures` slot
 * family under key `'earth:surface'` (minted in `wireSlots`,
 * `bodyTextureSlotRegistry`), whose commit dispatches to `setMap('surface', …)`.
 * Until it lands the renderer draws a plain mid-blue sphere sampled from a 1×1
 * placeholder texture created at construction — the geometry is visible-but-plain
 * rather than absent, which keeps the descent legible even before the asset
 * arrives. `setMap('surface', bitmap)` uploads the real equirectangular texture
 * (via `copyExternalImageToTexture`) into a SECOND layer that shadows the
 * placeholder, and rebuilds the fragment bind group.
 *
 * `setPlaceholderMap` upgrades the stand-in itself, from a tile of the shared
 * low-resolution body atlas that loads first at boot — so the pre-Blue-Marble
 * Earth is a recognisable low-res Earth rather than a blue ball. The two setters
 * write two different layers, which is what makes their arrival order irrelevant.
 */

import type { Renderer } from './Renderer';
import type { AtlasTileRect } from '../data/AtlasTileRect';
import type { TextureKind } from '../data/TextureKind';

export type EarthRenderer = Renderer & {
  /**
   * Install a texture map by kind. The `'surface'` kind replaces the current
   * day-albedo texture (initially a 1×1 mid-blue placeholder) with the supplied
   * equirectangular bitmap, `'material'` replaces the roughness/ocean-mask map
   * (initially a 1×1 all-land placeholder), `'night'` replaces the Black Marble
   * city-lights map (initially a 1×1 black placeholder → no emissive contribution,
   * so the dark side is lit only by `AMBIENT` until it lands), and `'normal'`
   * replaces the tangent-space relief map (initially a 1×1 flat-normal placeholder
   * → shading normal equals the geometric normal, so no relief until it lands),
   * and `'clouds'` replaces the cloud coverage map (initially a 1×1 transparent
   * placeholder → cloud alpha reads 0, so the surface fragment's cloud ground
   * shadow + city-light occlusion contribute nothing until it lands): each
   * uploads via `copyExternalImageToTexture` into a fresh texture sized to the
   * bitmap — format chosen by `isLinearTextureKind` (`rgba8unorm-srgb` for the
   * sRGB surface + emissive night colour + cloud colour, linear `rgba8unorm` for
   * the material + normal data) — generates mips, then rebuilds the fragment bind
   * group so subsequent draws sample the real map. Every `TextureKind` is now
   * wired — one `(bodyId, kind)` family feeds one setter, no inert kind remains.
   */
  setMap(kind: TextureKind, bitmap: ImageBitmap): void;
  /**
   * Seed a kind's PLACEHOLDER — what Earth shows for a kind `setMap` has not
   * supplied yet — from one tile of the shared low-resolution body atlas, in place
   * of the 1×1 created at construction.
   *
   * `rect` names the tile inside `atlas` in UNFLIPPED source coordinates (top-left
   * origin, y increasing downward — what `atlasTileRect` returns). Only that rect
   * is copied, into a fresh texture of the tile's own size in the kind's format
   * (`isLinearTextureKind`, the same predicate `setMap` uses, so a placeholder can
   * never disagree with the map that later shadows it) with a full mip chain. The
   * atlas is therefore a TRANSPORT container and never a bound texture: no shader,
   * layout, sampler or UV change follows from it.
   *
   * Writes the OTHER texture layer from `setMap`, which is the whole point:
   * whichever of the two arrives second, the committed hi-res map wins, with no
   * ordering check anywhere. Replacing a kind's placeholder frees the one it
   * replaces (the 1×1, or an earlier tile) and never touches the committed map.
   * In practice only `'surface'` has an atlas tile.
   */
  setPlaceholderMap(kind: TextureKind, atlas: ImageBitmap, rect: AtlasTileRect): void;
  /**
   * Bind the surface virtual texture's page table and tile atlas — the views
   * `earthTileSubsystem.getTileResources()` publishes once engaged — in place
   * of the 1x1 stand-ins bound from construction, and rebuild the fragment
   * bind group. A zero page-table weight means "sample the base", so an
   * un-called renderer draws exactly the no-feature picture.
   *
   * Call on the null-to-non-null transition, NOT every frame: the two views
   * are identity-stable once created. Views stay owned by the subsystem —
   * this renderer's teardown releases only its own stand-ins.
   */
  setTileResources(pageTable: GPUTextureView, atlas: GPUTextureView): void;
  /**
   * Draw the Earth into the current pass. `uniforms` is a length-32 Float32Array
   * (the 128-byte `EarthSurfaceUniforms` record from `packEarthSurfaceUniforms`):
   * 16 f32 column-major MVP + 3 f32 body-local sun direction + `roughnessBase` +
   * 3 f32 camera-in-local-frame + `f0` + `sunIrradiance` + `cloudShadowStrength` +
   * `cloudShellRadius` + `ambientLight` + `oceanRoughness` + 3 f32 pad — written to
   * the uniform buffer and drawn indexed.
   */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void;
};
