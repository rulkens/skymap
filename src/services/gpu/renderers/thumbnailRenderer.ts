/**
 * ThumbnailRenderer — billboard quad pass for galaxy thumbnails.
 *
 * Runs AFTER the existing point pass each frame. Each instance is one
 * textured quad whose center matches a galaxy and whose size is
 * controlled by the engine. Atlas texture + sampler bind in group(0)
 * so the engine can re-bind cheaply as the atlas's underlying
 * GPUTexture stays put across frames.
 *
 * Why one atlas + one bind group? WebGPU caps simultaneously-bound
 * textures at ~16, and a per-galaxy GPUTexture would thrash the
 * resource pool. One atlas + one bind group = one draw call for
 * thousands of textured galaxies.
 *
 * ## Per-instance attributes (48 bytes / 12 floats)
 *
 *   posSize: vec4<f32>  (xyz, sizeWorld)
 *   uvRect:  vec4<f32>  (u0, v0, u1, v1)
 *   extras:  vec4<f32>  (fadeAlpha, _, _, _)
 *
 * The third vec4 carries the per-frame fade multiplier produced by the
 * engine — a combination of distance fade (smoothstep across the
 * apparent-size threshold band) and load fade (a ~400 ms ramp once a
 * fresh bitmap lands in the atlas). Three of four channels in `extras`
 * are reserved padding for future per-instance flags (e.g. selected,
 * highlighted) without growing the stride further.
 *
 * ## Why pure-additive blend
 *
 * Galaxy thumbnails are EMISSIVE content (a photograph of the galaxy's
 * actual light output), not opaque material occluding a background.
 * Additive blend means a thumbnail simply ADDS its emission to whatever's
 * already in the HDR target; overlapping galaxies + the Milky Way
 * impostor accumulate naturally without one covering up the other.
 *
 * An earlier revision used premultiplied OVER (`dstFactor:
 * 'one-minus-src-alpha'`) which treats the thumbnail as opaque material
 * with an alpha cutout: at fade-region pixels (alpha < 1) it preserved
 * (1 - alpha) of the existing pixel. Combined with depth-write that
 * occluded the later Milky Way pass, fade regions ended up as
 * `col*alpha` against a black HDR target — i.e. they faded to BLACK
 * instead of revealing the Milky Way underneath. Pure additive
 * sidesteps that entire reasoning.
 *
 * ## Why the file is named for what it draws, not the GPU primitive
 *
 * Pre-rename this file was `quadRenderer.ts` — a name that described
 * the GPU shape (a textured quad) rather than the purpose (galaxy
 * thumbnails). Every other renderer in the fleet names its purpose:
 * `diskRenderer` (galaxy disks), `proceduralDiskRenderer` (procedural
 * disks), `milkyWayRenderer` (the Milky Way), `filamentRenderer`
 * (cosmic filaments), `labelRenderer` (MSDF text labels). The shared
 * pipeline factory `createInstancedQuadRenderer` keeps the GPU-shape
 * name because it's deliberately purpose-agnostic infrastructure that
 * three consumers share.
 *
 * ## Why this is a thin wrapper post-Spec G
 *
 * The pipeline / BGL / uniform buffer / instance buffer plumbing now
 * lives in `instancedQuadRenderer.ts`, shared with disk + procedural
 * disk renderers. This file owns: the consumer-facing
 * `createThumbnailRenderer` factory signature (preserved unchanged
 * from Spec F, only renamed from `createQuadRenderer`), the
 * `ThumbnailInstance → packed Float32Array` serialization, and the
 * wrapper `draw(...)` that translates the engine's call convention
 * into the shared factory's `draw(args)` shape.
 */

import type { mat4 } from 'gl-matrix';
import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { ThumbnailInstance } from '../../../@types/rendering/ThumbnailInstance';
import type { ThumbnailRenderer } from '../../../@types/rendering/ThumbnailRenderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import vsCode from '../shaders/thumbnails/vertex.wesl?static';
import fsCode from '../shaders/thumbnails/fragment.wesl?static';
import { FLOATS_PER_INSTANCE, createInstancedQuadRenderer } from './instancedQuadRenderer';

export function createThumbnailRenderer(ctx: GpuContext, maxInstances = 256): ThumbnailRenderer {
  const inner = createInstancedQuadRenderer(ctx, {
    label: 'thumbnail',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    atlas: {},
    capacity: { kind: 'fixed', max: maxInstances },
    blend: 'additive',
    format: ctx.format,
  });

  function bindAtlas(atlasView: GPUTextureView): void {
    // The factory always exposes `bindAtlas` when `atlas` is set in
    // its config; the optional-chain matches its public type.
    inner.bindAtlas?.(atlasView);
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    instances: ReadonlyArray<ThumbnailInstance>,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
  ): void {
    if (instances.length === 0) return;

    // Pack the typed instance array into the shared 12-floats-per-
    // instance layout. Pre-Spec-G this was a fresh-per-frame
    // allocation (~12 KB at the v1 cap of 256 instances); preserve
    // that behavior to keep the refactor purely mechanical. The
    // unused trailing slots (`data[base + 9..11]`) come zero-
    // initialised by `Float32Array`, so we don't need to write them
    // explicitly.
    const data = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const ins = instances[i]!;
      const base = i * FLOATS_PER_INSTANCE;
      data[base + 0] = ins.x;
      data[base + 1] = ins.y;
      data[base + 2] = ins.z;
      data[base + 3] = ins.sizeWorld;
      data[base + 4] = ins.u0;
      data[base + 5] = ins.v0;
      data[base + 6] = ins.u1;
      data[base + 7] = ins.v1;
      data[base + 8] = ins.fadeAlpha;
      // data[base + 9..11] reserved (left zero by Float32Array init)
    }

    // Cast `mat4` (gl-matrix's branded Float32Array subtype) to a
    // plain Float32Array for the shared factory's signature; runtime
    // identity is unchanged.
    inner.draw({
      pass,
      viewProj: viewProj as Float32Array,
      viewport: viewportPx,
      instanceBytes: data,
      instanceCount: instances.length,
      camPosWorld,
      pxPerRad,
    });
  }

  const renderer: ThumbnailRenderer = {
    label: 'thumbnailRenderer',
    bindAtlas,
    draw,
    destroy: inner.destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
