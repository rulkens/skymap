/**
 * bodyGlintRenderer — the sub-pixel scene bodies as brightness-scaled additive
 * point sprites in the depthless HDR accumulation.
 *
 * ### Why a thin dedicated pipeline — the close sibling of starPointRenderer
 *
 * This is a near-verbatim twin of `starPointRenderer`: a 28-byte instance
 * layout, one 80-byte camera uniform, and a vertex/fragment pair that shares the
 * actual common substance (`lib/camera` + `lib/billboard`, the Gaussian dot) at
 * the WESL level. The two are STRONG candidates to merge into one "point glint"
 * renderer taking `(position, color, brightness)` instances — that fold is
 * surfaced and deliberately DEFERRED in the spec (§14), to avoid entangling the
 * body glints into `starPointRenderer`'s subtle star-jitter rebase seam
 * mid-feature. The single difference the record carries is `brightness` (folded
 * into the tint in the vertex stage) where the star record carries `absMag`.
 *
 * ### Why draw takes the batch, not a setStars step
 *
 * `starPointRenderer` splits `setStars` (upload) from `draw` because its star
 * set is a membership the layer re-partitions; here the layer recomputes every
 * glint's BRIGHTNESS (phase, fade, apparent size) AND its camera-relative anchor
 * every frame, so there is no upload-on-change to cache — the whole batch is
 * fresh each frame. This renderer therefore follows the `planetRenderer` idiom:
 * `draw(pass, instances, count, viewProj, viewportPx)` uploads exactly the first
 * `count` records with one `writeBuffer` and issues one instanced draw. The
 * instance buffer is a single fixed-capacity allocation (there are at most
 * `MAX_GLINTS` seeded bodies), so no grow logic is needed.
 *
 * ### Pipeline profile — additive, depthless
 *
 * Colour target: the caller's `targetFormat` (the `hdr` row's `rgba16float`)
 * with one/one additive blending. NO `depthStencil` state: the `hdr` render
 * target is depthless (`renderTargets.ts`), and a pipeline that declares a depth
 * format for a pass with no depth attachment is a validation error. This is also
 * why the factory takes no `depthFormat` parameter, unlike the sphere-body
 * factories that draw into the depth-bearing `foreground:0` row.
 *
 * ### Precision — camera-relative inputs, then f32 narrowing
 *
 * Both the instance positions and the view-projection arrive already rebased
 * into the CAMERA-RELATIVE frame — the layer subtracts the eye from each anchor
 * and folds the eye offset into the vp via `rebaseViewProj`, both in f64, before
 * handing them here. Rebasing turns both operands into small, well-conditioned
 * numbers, so the f32 narrowing carries no catastrophic cancellation. This
 * renderer stays a dumb pipeline: it narrows whatever frame it is handed — the
 * seam lives in the layer, exactly as for `starPointRenderer`.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { BodyGlintRenderer } from '../../../../@types/rendering/BodyGlintRenderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import vsCode from '../../shaders/bodies/bodyGlint/vertex.wesl?static';
import fsCode from '../../shaders/bodies/bodyGlint/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

/**
 * Upper bound on body glints drawn per frame. The glints branch is a subset of
 * the seeded bodies (the flat/textured branches take the rest), so it never
 * exceeds the ~21 seeded planets/moons; this caps the instance buffer with
 * headroom — see "Why draw takes the batch" above, its instance buffer is a
 * single fixed-capacity allocation.
 */
export const MAX_GLINTS = 24;

/**
 * Per-glint instance record: position (f32x3) + colour (f32x3) + brightness
 * (f32) = 7 floats, 28 bytes. Must stay byte-exact with the attribute
 * declarations in `bodyGlint/vertex.wesl` (locations 0/1/2 at offsets 0/12/24)
 * — the vertex-stride keep-rule.
 */
export const INSTANCE_FLOATS = 7;
const STRIDE = INSTANCE_FLOATS * 4; // 28 bytes

export function createBodyGlintRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): BodyGlintRenderer {
  // ── Uniform buffer + CPU scratch ──────────────────────────────────────────
  //
  // The bare 80-byte CameraUniforms prefix: floats 0..15 = viewProj,
  // 16..17 = viewportPx, 18..19 = named pads (stay 0).
  const uniformBuffer = device.createBuffer({
    label: 'body-glints-uniform-buffer',
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(CAMERA_UNIFORM_BYTES / 4);

  // ── Bind group (explicit layout, not 'auto') ──────────────────────────────
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'body-glints-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const bindGroup = device.createBindGroup({
    label: 'body-glints-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'bodyGlint.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'bodyGlint.fragment');

  // ── Render pipeline (additive, depthless — see module header) ─────────────
  const pipeline = device.createRenderPipeline({
    label: 'body-glints-pipeline',
    layout: device.createPipelineLayout({
      label: 'body-glints-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: STRIDE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // color
            { shaderLocation: 2, offset: 24, format: 'float32' }, // brightness
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
          // One/one additive blend on premultiplied output — overlapping glints
          // brighten, matching the star points' HDR convention.
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    // NO depthStencil: the hdr target has no depth attachment.
  });

  // ── Glint instance buffer (fixed capacity) ────────────────────────────────
  //
  // Sized once to MAX_GLINTS records. `draw` overwrites the first `count`
  // records each frame with one `writeBuffer`; the instance step means
  // `@builtin(instance_index)` selects a glint's record. There are at most
  // MAX_GLINTS seeded bodies, so no grow logic is needed.
  const instanceBuffer = device.createBuffer({
    label: 'body-glints-instance-buffer',
    size: MAX_GLINTS * STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(
    pass: GPURenderPassEncoder,
    instances: Float32Array,
    count: number,
    viewProj: Float32Array,
    viewportPx: Vec2,
  ): void {
    // Clamp to the cap so an over-count caller draws MAX_GLINTS rather than off
    // the end of the buffer. Nothing to do for a zero-length batch.
    const n = Math.min(Math.max(count, 0), MAX_GLINTS);
    if (n === 0) return;

    // uniformScratch[18..19] are CameraUniforms' named pads — never written, so
    // they hold their construction-time zeros across frames.
    writeCameraPrefix(uniformScratch, viewProj, viewportPx);
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    // One upload of exactly the first `n` records (typed-array overload takes
    // the data offset + size in ELEMENTS, not bytes).
    device.queue.writeBuffer(instanceBuffer, 0, instances, 0, n * INSTANCE_FLOATS);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, instanceBuffer);
    // Six vertices per instanced billboard quad — the vertex stage maps
    // vertex_index 0..5 through lib/billboard's quadCorner.
    pass.draw(6, n);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    instanceBuffer.destroy();
    uniformBuffer.destroy();
  }

  const renderer: BodyGlintRenderer = {
    label: 'bodyGlintRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
