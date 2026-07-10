/**
 * starPointRenderer — the neighbourhood's distant stars as additive point
 * sprites in the depthless HDR accumulation.
 *
 * ### Why a thin dedicated pipeline, not a `createPointRenderer` wrap
 *
 * The survey point pipeline (`pointRenderer.ts`) was the candidate for
 * reuse — it already draws additive soft dots into the same rgba16float
 * target. But its factory signature threads three engine bind-group
 * layouts (`fadeBgl` / `sourceBgl` / `focusBgl`), its upload path runs a
 * `GalaxyCatalog` through an off-thread worker bake into a 52-byte
 * 13-slot instance layout, and its vertex stage carries Malmquist gating,
 * per-source depth fade, crossfade bands and pick-identity packing. A
 * handful of seeded scene stars needs NONE of that — wrapping would mean
 * fabricating a fake catalog + registry entry and binding three no-op
 * uniform groups per draw just to satisfy machinery the stars never read.
 * The thin pipeline here is a 28-byte instance layout, one 80-byte camera
 * uniform, and a vertex/fragment pair that shares the actual common
 * substance (`lib/camera` + `lib/billboard` helpers, the Gaussian dot
 * profile) at the WESL level instead of at the pipeline level.
 *
 * ### Pipeline profile — additive, depthless
 *
 * Colour target: the caller's `targetFormat` (the `hdr` row's
 * `rgba16float`) with one/one additive blending, matching the survey
 * points. NO `depthStencil` state: the `hdr` render target is depthless
 * (`renderTargets.ts` — `{ id: 'hdr', depth: null }`), and a pipeline
 * that declares a depth format for a pass with no depth attachment is a
 * validation error. This is also why the factory takes no `depthFormat`
 * parameter, unlike the sphere-body factories that draw into the
 * depth-bearing `foreground:0` row.
 *
 * ### Precision — f32 positions are fine for points
 *
 * Star positions live at parsec scale (~1e-6 Mpc) in the absolute
 * heliocentric frame. The f64 compose path exists for SPHERE-FILLING
 * bodies, where camera-relative f32 error is visible as surface swim; a
 * star drawn as a point subtends under a pixel by definition, so the f32
 * narrowing error (relative eps ~1e-7) stays sub-pixel at any camera
 * distance that shows it as a point at all. `setStars` therefore narrows
 * `positionMpc` straight into the f32 instance buffer, and `draw` takes
 * the slab's f32 narrow view-projection (`view.vp`).
 *
 * ### Late-bound star data
 *
 * Mirrors `earthRenderer.setTexture`: the factory builds the pipeline
 * immediately and the layer delivers data when it has it. Until a
 * non-empty `setStars` lands, `draw` is a no-op (no placeholder needed —
 * an additive pass with nothing to add is correctly invisible, unlike the
 * Earth where an absent texture would mean an invisible planet).
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { StarPointRenderer } from '../../../@types/rendering/StarPointRenderer';
import type { StarBody } from '../../../@types/scene/StarBody';
import type { Vec2 } from '../../../@types/math/Vec2';
import vsCode from '../shaders/starPoints/vertex.wesl?static';
import fsCode from '../shaders/starPoints/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/**
 * Per-star instance record: position (f32x3) + colour (f32x3) + absMag
 * (f32) = 7 floats, 28 bytes.  Must stay byte-exact with the attribute
 * declarations in `starPoints/vertex.wesl` (locations 0/1/2 at offsets
 * 0/12/24).
 */
const FLOATS_PER_STAR = 7;
const STAR_STRIDE = FLOATS_PER_STAR * 4; // 28 bytes

/**
 * `CameraUniforms` byte size (see `lib/camera.wesl`): mat4x4<f32>
 * viewProj (64) + vec2<f32> viewportPx (8) + two pad floats (8) = 80.
 */
const UNIFORM_BUFFER_SIZE = 80;

export function createStarPointRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StarPointRenderer {
  // ── Uniform buffer + CPU scratch ──────────────────────────────────────────
  //
  // The bare 80-byte CameraUniforms prefix: floats 0..15 = viewProj,
  // 16..17 = viewportPx, 18..19 = named pads (stay 0).
  const uniformBuffer = device.createBuffer({
    label: 'star-points-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(UNIFORM_BUFFER_SIZE / 4);

  // ── Bind group (explicit layout, not 'auto') ──────────────────────────────
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'star-points-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const bindGroup = device.createBindGroup({
    label: 'star-points-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'starPoints.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'starPoints.fragment');

  // ── Render pipeline (additive, depthless — see module header) ────────────
  const pipeline = device.createRenderPipeline({
    label: 'star-points-pipeline',
    layout: device.createPipelineLayout({
      label: 'star-points-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: STAR_STRIDE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // color
            { shaderLocation: 2, offset: 24, format: 'float32' }, // absMag
          ],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // One/one additive blend on premultiplied output — overlapping
          // stars brighten, matching the survey points' HDR convention.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    // NO depthStencil: the hdr target has no depth attachment.
  });

  // ── Star instance buffer (late-bound via setStars) ────────────────────────

  let instanceBuffer: GPUBuffer | null = null;
  let starCount = 0;

  function setStars(stars: readonly StarBody[]): void {
    // Replace-on-upload: GPU buffers are fixed-size, so a new star set
    // means a fresh buffer. `destroy()` on the old one is safe even if a
    // prior frame referenced it — WebGPU defers the actual release until
    // in-flight work completes.
    instanceBuffer?.destroy();
    instanceBuffer = null;
    starCount = 0;
    // Empty set clears the renderer; `createBuffer({ size: 0 })` is
    // forbidden by the spec, so short-circuit (same guard as the survey
    // pipeline's empty-cloud unload signal).
    if (stars.length === 0) return;

    const interleaved = new Float32Array(stars.length * FLOATS_PER_STAR);
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i]!;
      const base = i * FLOATS_PER_STAR;
      // f64 → f32 narrowing is deliberate here — see the module header's
      // precision note.
      interleaved[base + 0] = star.positionMpc[0];
      interleaved[base + 1] = star.positionMpc[1];
      interleaved[base + 2] = star.positionMpc[2];
      interleaved[base + 3] = star.color[0];
      interleaved[base + 4] = star.color[1];
      interleaved[base + 5] = star.color[2];
      interleaved[base + 6] = star.absMag;
    }

    instanceBuffer = device.createBuffer({
      label: 'star-points-instance-buffer',
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(instanceBuffer, 0, interleaved);
    starCount = stars.length;
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void {
    if (instanceBuffer === null || starCount === 0) return;

    uniformScratch.set(viewProj, 0);
    uniformScratch[16] = viewportPx[0];
    uniformScratch[17] = viewportPx[1];
    // uniformScratch[18..19] are CameraUniforms' named pads — left at 0.
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, instanceBuffer);
    // Six vertices per instanced billboard quad — the vertex stage maps
    // vertex_index 0..5 through lib/billboard's quadCorner.
    pass.draw(6, starCount);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    instanceBuffer?.destroy();
    instanceBuffer = null;
    starCount = 0;
    uniformBuffer.destroy();
  }

  const renderer: StarPointRenderer = {
    label: 'starPointRenderer',
    setStars,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
