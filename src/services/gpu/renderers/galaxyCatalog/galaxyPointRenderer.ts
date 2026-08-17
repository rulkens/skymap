/**
 * GalaxyPointRenderer — GPU pipeline owner for instanced billboard point sprites.
 *
 * Each catalog point renders as a single 3-vertex triangle that
 * circumscribes the unit UV circle, via WebGPU's instanced draw
 * (`draw(3, N)`).  The vertex stage reads `@builtin(vertex_index)`
 * (0..2, the corner) and per-instance attributes (position, magnitude,
 * colour index, axis ratio, baked PA cos/sin, padded radius, three bias
 * weights, baked absMag — see `GALAXY_POINT_VERTEX_ATTRIBUTES`).  A triangle
 * rather than the usual 6-vertex quad because this pass is vertex/
 * primitive-bound at ~2.5M instances: `draw(3, N)` halves the
 * vertex-shader invocations and the primitive setup, while the fragment
 * shader's r² > 1 discard keeps visible coverage identical (only the
 * discarded margin grows — see `triCorner` in `lib/billboard.wesl`).
 *
 * This module owns only what exists once per pipeline: the shader
 * modules, the pipeline layout + pipeline, the per-frame `@group(0)`
 * uniform buffer, and the per-frame writes (fade opacity, visibility
 * mask).  The per-catalog GPU resources — one vertex buffer, fade and
 * source uniforms, and their bind groups per loaded catalog — live in
 * `catalogStore`, which the factory composes.  The renderer's public
 * surface still exposes the store's methods (the engine, picker and
 * bias-correction subsystem all talk to the renderer), but they are
 * delegations, not implementations.
 *
 * An engine-supplied bitmask decides which catalogs draw each frame.
 * Each catalog's `@group(2)` SourceUniforms carries a 5-bit `sourceCode`
 * that the vertex stage composes with `@builtin(instance_index)` into the
 * fragment's packed identity for `fsPick` to write into the r32uint pick
 * texture.
 *
 *   GalaxyCatalog → upload(id, …) → catalogStore → GPU vertex buffer per catalog
 *   OrbitCamera   → computeViewProj() → draw() → uniform buffer (per frame)
 *
 * @module
 */

import type { Mat4 } from 'wgpu-matrix';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { GalaxyPointDrawSettings } from '../../../../@types/rendering/GalaxyPointDrawSettings';
import type { GalaxyPointRenderer } from '../../../../@types/rendering/GalaxyPointRenderer';
import type { Vec2 } from '../../../../@types/math/Vec2';

// `?static` runs the WESL linker at build time and hands back a plain
// WGSL string with imports resolved.
import vsCode from '../../shaders/galaxyCatalog/points/vertex.wesl?static';
import colorFsCode from '../../shaders/galaxyCatalog/points/colorFragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../../@types/rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../../../@types/rendering/FocusUniformsBgl';
import { packGalaxyPointUniforms } from '../../../../utils/gpu/packGalaxyPointUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import {
  POINT_STRIDE,
  GALAXY_POINT_VERTEX_ATTRIBUTES,
  UNIFORM_BYTES,
} from './galaxyPointVertexLayout';
import { createCatalogStore, type BuildRunner } from './catalogStore';

// The `schechter*` uniform slots at byte offsets 140..155 are
// dead-but-reserved: the Schechter integral bakes into the per-vertex
// `schechterRatio` attribute, so no shader reads these slots.  They
// stay in the `Uniforms` struct for layout stability — removing them
// would shift every subsequent member's offset.

/**
 * Build the render pipeline, allocate the uniform buffer, create the
 * bind group, and open a `catalogStore` for the per-catalog resources.
 * Pipeline state lives in closure scope and never changes; everything
 * mutable is the store's.
 *
 * A named bag rather than a positional list: the five construction
 * dependencies are all opaque handles (three of them structurally
 * indistinguishable bind-group layouts), so a mis-ordered call would
 * typecheck and fail at pipeline-creation time instead of at the call
 * site.
 *
 * @param init.device        The WebGPU logical device. Owned by the caller.
 * @param init.targetFormat  The colour-target format the pipeline writes into —
 *                           the HDR offscreen (`'rgba16float'`), NOT the swap
 *                           chain.  Handed over explicitly because a render-pass
 *                           encoder cannot be queried for its own
 *                           colour-attachment format.
 * @param init.buildRunner   The vertex-buffer bake runner handed to the store,
 *                           defaulting to its worker-spawning runner.  Injected
 *                           per renderer rather than swapped through a
 *                           module-global setter: a module-global is shared by
 *                           every renderer instance in the process and leaks
 *                           between tests, so an override installed for one
 *                           case silently governs the next.
 */
export function createGalaxyPointRenderer(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
  fadeBgl: FadeUniformsBgl;
  sourceBgl: SourceUniformsBgl;
  focusBgl: FocusUniformsBgl;
  buildRunner?: BuildRunner;
}): GalaxyPointRenderer {
  const { device, targetFormat, fadeBgl, sourceBgl, focusBgl } = init;

  // Each renderer compiles its own GPUShaderModule from the shared
  // vertex source — sharing modules across pipelines hits the WebGPU
  // 'auto' bind-group-layout trap (auto layouts have pipeline-specific
  // identity).
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'points.vertex');
  const fsModule = createShaderModuleWithDevLog(device, colorFsCode, 'points.colorFragment');

  const pipelineLayout = device.createPipelineLayout({
    label: 'points-pipeline-layout',
    bindGroupLayouts: [
      // @group(0) per-frame Uniforms (points-pipeline-specific).
      device.createBindGroupLayout({
        label: 'points-bgl-group0',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      }),
      fadeBgl, // @group(1) FadeUniforms (canonical)
      sourceBgl, // @group(2) SourceUniforms (canonical, shared with PickRenderer)
      // @group(3) FocusUniforms — a single shared/global binding (only
      // one POI focused at a time), unlike the per-source @group(1) fade.
      focusBgl,
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'points-pipeline',
    layout: pipelineLayout,

    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          // Spread because `@webgpu/types` declares the field mutable
          // while the canonical export is readonly.
          attributes: [...GALAXY_POINT_VERTEX_ATTRIBUTES],
        },
      ],
    },

    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Additive blend so overlapping halos brighten (long-exposure style).
          blend: ADDITIVE_BLEND,
        },
      ],
    },

    primitive: { topology: 'triangle-list' },
  });

  const uniformBuffer = device.createBuffer({
    label: 'points-uniform-buffer',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'points-bg-uniforms',
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // 16 bytes (opacity + pad) of scratch reused per-source-per-frame
  // for the fade `writeBuffer` call.  Pad slots stay zero.  Per-frame,
  // so it stays here rather than in the store: the store owns the fade
  // *buffer*, this owns the bytes written into it each frame.
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  // The per-catalog GPU resources.  The store shares this renderer's
  // device + canonical fade/source layouts, so the bind groups it mints
  // are the ones this pipeline binds.
  const store = createCatalogStore({
    device,
    fadeBgl,
    sourceBgl,
    buildRunner: init.buildRunner,
  });

  // ─── Draw ────────────────────────────────────────────────────────────────────

  /**
   * Pack and upload the per-frame uniform buffer, then issue one
   * instanced draw per visible source.  Per-source fade opacity rides
   * on each source's own 16-byte fade buffer, so writes for one
   * source don't race against draws against another.
   *
   * No-op when there are no catalogs to draw. The pick pass rebuilds its
   * own uniform bytes from plain values at pick time (see
   * `pickUniformBytesOf`), so this draw owns no cross-pass snapshot.
   */
  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    settings: GalaxyPointDrawSettings,
  ): void {
    const { visibleSourceMask, focusBindGroup } = settings;

    // Materialised because the "nothing loaded, skip the uniform write
    // entirely" early-out needs to know emptiness before the loop.  At
    // most five catalogs exist, so the array is noise next to the ~2.5M
    // instances the loop below dispatches.
    const catalogs = Array.from(store.entries());
    if (catalogs.length === 0) return;

    // Pack 176 bytes — see `UNIFORM_BYTES` for the layout, and
    // `points/io.wesl::Uniforms` for the WGSL-side struct.  `pickPass`
    // defaults to 0 (visual pass); the pick path packs its own image via
    // `pickUniformBytesOf`, never this buffer.
    const buf = packGalaxyPointUniforms(viewProj, viewportPx, settings);
    device.queue.writeBuffer(uniformBuffer, 0, buf);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // @group(3) focus is the engine's shared focus bind group (one POI
    // focused at a time, written once per frame in renderFrame). Bind once
    // before the per-source loop, not per source like fade/source.
    pass.setBindGroup(3, focusBindGroup);

    for (const catalog of catalogs) {
      const source = catalog.source;
      // Inlined `maskHas(visibleSourceMask, source)` — hot path.  The
      // mask + per-source fade are keyed by the numeric code the store
      // yields alongside each entry.
      if (((visibleSourceMask >> source) & 1) === 0) continue;

      // Fully faded (exactly 0) → skip the source outright: every instance
      // would rasterize at alpha 0 into an additive target — pure GPU cost
      // for zero contribution. No pop is possible: a fade reaches 0
      // continuously before this skip engages, so the last drawn frame was
      // already invisible.
      const fadeOpacity = settings.fadeOpacityOf(source);
      if (fadeOpacity === 0) continue;

      // One 16-byte fade writeBuffer per visible galaxy catalog per frame.
      fadeScratchF32[0] = fadeOpacity;
      device.queue.writeBuffer(catalog.fadeBuffer, 0, fadeScratchBuffer);

      pass.setBindGroup(1, catalog.fadeBindGroup);
      pass.setBindGroup(2, catalog.sourceBindGroup);
      pass.setVertexBuffer(0, catalog.vertexBuffer);
      pass.draw(3, catalog.count);
    }
  }

  /**
   * Release every GPU resource this renderer owns: the store's
   * per-catalog buffers plus this pipeline's own uniform buffer.  Only
   * `GPUBuffer` and `GPUTexture` need explicit `destroy()` — they own
   * VRAM that JS GC alone won't release.  Pipelines / bind groups /
   * shader modules are JS-side handles and clean up via GC.
   *
   * Important in dev: Vite HMR + React StrictMode each tear down and
   * reconstruct the engine, leaking ~14 MB per SDSS deck plus per-
   * source buffers without this method.  After ten HMR saves the
   * browser GPU process can be wedged on a constrained laptop.
   *
   * Idempotent: `GPUBuffer.destroy()` is a no-op the second time, so
   * overlapping teardowns (HMR mid-StrictMode remount) are safe.
   */
  function destroy(): void {
    store.destroy();
    uniformBuffer.destroy();
  }

  const renderer: GalaxyPointRenderer = {
    label: 'galaxyPointRenderer',
    upload: store.upload,
    unload: store.unload,
    setBiasUploadCallback: store.setBiasUploadCallback,
    setBiasUnloadCallback: store.setBiasUnloadCallback,
    spliceSchechterRatios: store.spliceSchechterRatios,
    spliceAngularWeights: store.spliceAngularWeights,
    clearBiasOverlays: store.clearBiasOverlays,
    totalCount: store.totalCount,
    countOf: store.countOf,
    hasCatalog: store.hasCatalog,
    loadedSources: store.loadedSources,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
