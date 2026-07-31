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
 * ### Precision — camera-relative inputs, then f32 narrowing
 *
 * Both the instance positions and the view-projection arrive already rebased
 * into the CAMERA-RELATIVE frame — the caller (`starPointsLayer`) subtracts the
 * eye from each anchor and folds the eye offset into the vp via
 * `rebaseViewProj`, both in f64, before handing them here. That matters because
 * during the final approach to a local-map star the raw anchor (~1e-6 Mpc from
 * the render origin) and the raw view translation are near-equal large numbers
 * whose f32 subtraction cancels catastrophically, jittering the sprite centre.
 * Rebasing turns both operands into small, well-conditioned numbers, so
 * `setStars` narrows the (already camera-relative) `positionMpc` straight into
 * the f32 instance buffer and `draw` uploads the (already rebased) f32
 * view-projection with no precision loss. This renderer stays a dumb pipeline:
 * it narrows whatever frame it is handed — the seam lives in the layer.
 *
 * ### Late-bound star data
 *
 * Mirrors `earthRenderer.setMap`: the factory builds the pipeline
 * immediately and the layer delivers data when it has it. Until a
 * non-empty `setStars` lands, `draw` is a no-op (no placeholder needed —
 * an additive pass with nothing to add is correctly invisible, unlike the
 * Earth where an absent texture would mean an invisible planet).
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { StarPointRenderer } from '../../../../@types/rendering/StarPointRenderer';
import type { PositionedStar } from '../../../../@types/scene/PositionedStar';
import type { Vec2 } from '../../../../@types/math/Vec2';
import vsCode from '../../shaders/bodies/starPoints/vertex.wesl?static';
import fsCode from '../../shaders/bodies/starPoints/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

/**
 * Per-star instance record: position (f32x3) + colour (f32x3) + absMag
 * (f32) = 7 floats, 28 bytes.  Must stay byte-exact with the attribute
 * declarations in `starPoints/vertex.wesl` (locations 0/1/2 at offsets
 * 0/12/24).
 */
const FLOATS_PER_STAR = 7;
const STAR_STRIDE = FLOATS_PER_STAR * 4; // 28 bytes

/**
 * Uniform-buffer size for `StarPointUniforms` (`starPoints/io.wesl`): the shared
 * 80-byte `CameraUniforms` prefix + a `sizePx` / `brightness` tail rounded up to
 * the 16-byte alignment the prefix's `mat4x4` demands. `sizePx` lands at float
 * index 20 (byte 80), `brightness` at 21 (byte 84); floats 22..23 are the
 * alignment pad (Float32Array zero-init, never written).
 */
const STAR_POINT_UNIFORM_BYTES = 96;
const UNIFORM_SIZEPX_INDEX = 20;
const UNIFORM_BRIGHTNESS_INDEX = 21;

export function createStarPointRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StarPointRenderer {
  // ── Uniform buffer + CPU scratch ──────────────────────────────────────────
  //
  // The 80-byte CameraUniforms prefix (floats 0..15 = viewProj, 16..17 =
  // viewportPx, 18..19 = named pads, stay 0) plus the sizePx / brightness tail
  // at floats 20 / 21 (22..23 pad, stay 0). See STAR_POINT_UNIFORM_BYTES.
  const uniformBuffer = device.createBuffer({
    label: 'star-points-uniform-buffer',
    size: STAR_POINT_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(STAR_POINT_UNIFORM_BYTES / 4);

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
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    // NO depthStencil: the hdr target has no depth attachment.
  });

  // ── Star instance buffer (late-bound via setStars) ────────────────────────
  //
  // Grow-only reuse, NOT replace-on-upload. `starPointsLayer.draw` calls
  // `setStars` EVERY frame — the camera-relative anchors it hands us change
  // per frame (the eye is subtracted in f64 before narrowing here). A
  // create/destroy of the GPU buffer per call would mean a fresh allocation
  // and release 60×/sec on a hot path. Instead the buffer is allocated once
  // sized to the first non-empty set and reallocated ONLY when a later set
  // exceeds the current capacity; each call re-uploads the live subset via
  // `writeBuffer`. With the static `SCENE_STARS` seed the star count never
  // grows post-boot, so this is one bounded allocation for the process
  // lifetime. `capacityStars` (buffer capacity) is tracked separately from
  // `starCount` (the live count `draw` instances) so a shrink reuses the
  // larger buffer and draws the smaller subset.

  let instanceBuffer: GPUBuffer | null = null;
  let capacityStars = 0;
  let starCount = 0;

  function setStars(stars: readonly PositionedStar[]): void {
    starCount = stars.length;
    // Empty set clears the renderer to the no-op draw state; keep any
    // existing buffer allocated (it is bounded, and a later non-empty set
    // reuses it). `createBuffer({ size: 0 })` is forbidden by the spec, so
    // never allocate here.
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

    // Reallocate only when the current buffer can't hold the new set.
    // `destroy()` on the old one is safe even if a prior frame referenced
    // it — WebGPU defers the actual release until in-flight work completes.
    if (instanceBuffer === null || stars.length > capacityStars) {
      instanceBuffer?.destroy();
      capacityStars = stars.length;
      instanceBuffer = device.createBuffer({
        label: 'star-points-instance-buffer',
        size: capacityStars * STAR_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(instanceBuffer, 0, interleaved);
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    opts: { sizePx: number; brightness: number },
  ): void {
    if (instanceBuffer === null || starCount === 0) return;

    // uniformScratch[18..19] are CameraUniforms' named pads and [22..23] the
    // tail's alignment pad — never written, so they hold their construction-time
    // zeros across frames. sizePx / brightness ride the tail at floats 20 / 21
    // (byte-exact with StarPointUniforms in starPoints/io.wesl).
    writeCameraPrefix(uniformScratch, viewProj, viewportPx);
    uniformScratch[UNIFORM_SIZEPX_INDEX] = opts.sizePx;
    uniformScratch[UNIFORM_BRIGHTNESS_INDEX] = opts.brightness;
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
    capacityStars = 0;
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
