/**
 * PickRenderer — the point-pick draw provider for the pick program.
 *
 * Records the galaxy point-billboard draw into an already-begun r32uint
 * pick pass, where each fragment encodes `(sourceCode << 27) | localIdx + 1`
 * (see `pickFragment.wesl`). It owns no pass, no texture, and no readback:
 * the pick program (`pickProgram.ts`) begins the pass, drives the readback,
 * and folds results across slabs. This renderer is one `drawPick` provider
 * among the content-layer registry's pickable rows.
 *
 * The pick pipeline owns its OWN uniform buffer (`pickUniformBuffer`,
 * allocated at construction). `drawPoints` receives the caller's
 * `uniformBytes` — built at pick time from the slab view via
 * `pickUniformBytesOf`, which delegates to the same `packPointUniforms` the
 * visual pass uses — uploads them in full, then applies three pick-specific
 * overrides (selectedPacked sentinel, padded pointSizePx, pickPass = 1) on
 * top. The visual pass's GPU buffer is NEVER touched; two-writer corruption
 * is gone.
 *
 * Depth (`depth24plus`, `less`, write-enabled) resolves overlapping
 * billboards so the front-most wins, matching visual occlusion. The visual
 * pipeline skips depth because additive blending wants every halo to
 * contribute.
 *
 * @module
 */

// Vertex source is textually shared with PointRenderer but compiled
// into our own GPUShaderModule — never share modules across pipelines
// (see the `auto` bind-group-layout trap in pointRenderer.ts).
import vsCode from '../shaders/points/vertex.wesl?static';
import pickFsCode from '../shaders/points/pickFragment.wesl?static';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PickSourceDraw } from '../../../@types/rendering/PickSourceDraw';
import type { PickRenderer } from '../../../@types/rendering/PickRenderer';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
import {
  POINT_STRIDE,
  POINT_VERTEX_ATTRIBUTES,
  SELECTED_PACKED_BYTE_OFFSET,
  POINT_SIZE_BYTE_OFFSET,
  PICK_PASS_BYTE_OFFSET,
  UNIFORM_BYTES,
} from './pointRenderer';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { SELECTION_NONE_SENTINEL } from '../../../data/selectionEncoding';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Extra pixels added to `pointSizePx` for the pick pass.  Widens the
 * click target for distant point-like galaxies (5 px-diameter dots at
 * the default 2.5 px floor → ~9 px with padding) without growing the
 * visible sprites.  Additive so it scales with the user's slider.
 */
const PICK_PADDING_PX = 4;

/**
 * Construct a `PickRenderer` bound to `device`.  The renderer owns its own
 * `pickUniformBuffer`; `drawPoints` callers pass the pick frame's packed
 * uniform bytes per call rather than sharing the point renderer's live GPU
 * buffer.
 *
 * `focusBindGroup` is the engine's shared cluster-focus bind group (live
 * buffer, written once per frame in renderFrame).  Bound at @group(3) so the
 * pick pass sees the same focus state the visual pass does and the shared
 * vertex shader can cull non-members of a focused structure from hit-testing.
 */
export function createPickRenderer(
  device: GPUDevice,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
  focusBgl: FocusUniformsBgl,
  focusBindGroup: GPUBindGroup,
): PickRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'pick.vertex');
  const fsModule = createShaderModuleWithDevLog(device, pickFsCode, 'pick.pickFragment');

  // Explicit pipeline layout (not 'auto') so @group(1) FadeUniforms
  // and @group(2) SourceUniforms share identity with the visual
  // pipeline — bind groups built against the canonical BGLs work for
  // either pipeline.
  const pipelineLayout = device.createPipelineLayout({
    label: 'pick-pipeline-layout',
    bindGroupLayouts: [
      device.createBindGroupLayout({
        label: 'pick-bgl-group0',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      }),
      fadeBgl,
      sourceBgl,
      focusBgl,
    ],
  });

  // The shared vertex shader's layout declares @group(1) FadeUniforms
  // even though the pick fragment never reads fade.opacity.  Zeroed
  // dummy buffer keeps the bind group valid.
  const dummyFadeBuffer = device.createBuffer({
    label: 'pick-fade-uniform-dummy',
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
  });
  const dummyFadeBindGroup = device.createBindGroup({
    label: 'pick-fade-bg-dummy',
    layout: fadeBgl,
    entries: [{ binding: 0, resource: { buffer: dummyFadeBuffer } }],
  });

  // @group(2) bind groups cached by GPUBuffer identity — drawPoints fires
  // on every hover/click and the loaded sources are stable between
  // picks.  WeakMap means a tier swap that destroys the old
  // sourceBuffer invalidates the cached bind group via GC.
  const sourceBindGroupCache = new WeakMap<GPUBuffer, GPUBindGroup>();

  const pipeline = device.createRenderPipeline({
    label: 'pick-pipeline',
    layout: pipelineLayout,

    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      // Layout imported from PointRenderer as the single source of
      // truth — both pipelines bind the same const so drift is
      // structurally impossible.  Spread because @webgpu/types
      // declares `attributes` as mutable.
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          attributes: [...POINT_VERTEX_ATTRIBUTES],
        },
      ],
    },

    fragment: {
      module: fsModule,
      entryPoint: 'fsPick',
      // r32uint: 32-bit unsigned int per texel.  No blend descriptor;
      // WebGPU disallows blending on integer formats.  Depth test
      // resolves overlapping fragments instead.
      targets: [{ format: 'r32uint' }],
    },

    primitive: { topology: 'triangle-list' },

    // Front-most point wins per pixel (the visual pass omits depth so
    // additive halos can overlap; the pick pass needs single-claim).
    // `depthWriteEnabled` must be true or every fragment passes.
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // The pick renderer's own uniform buffer.  `drawPoints` uploads the
  // caller's `uniformBytes` (built at pick time from the slab view) here and
  // then applies the three pick-specific overrides on top — the visual
  // pass's GPU buffer is never touched.
  // Why own the buffer rather than sharing?  Two writers on one buffer
  // is the bug this design deletes: pick would scribble on the visual
  // uniforms and rely on the next render frame to undo the damage.
  const pickUniformBuffer = device.createBuffer({
    label: 'pick-uniform-buffer',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // @group(0) bind group built once at construction time, bound on
  // every `drawPoints`.  Building once avoids a per-draw `createBindGroup`
  // and lets the pipeline layout's group(0) slot hold a stable object.
  const pickUniformBindGroup = device.createBindGroup({
    label: 'pick-uniform-bg',
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: pickUniformBuffer } }],
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record the point-pick draw into an already-begun render pass — the
   * point half of the pick pass, callable as a `drawPick` layer surface.
   *
   * `uniformBytes` is built at pick time from the slab view (see
   * `pickUniformBytesOf`); it is uploaded verbatim to the renderer's
   * OWN `pickUniformBuffer`, then the three pick-specific fields are
   * overridden in place.  The caller owns the pass lifecycle
   * (`beginRenderPass` / `pass.end()`).
   *
   * `@group(0)` prefix contract: any sibling pick pipeline that reads the
   * point pick uniform via the caller-bound `@group(0)` CameraUniforms
   * prefix relies on the upload + bind happening unconditionally — a
   * galaxy-empty scene (every catalog toggled off) must still leave slot 0
   * pointing at the freshly-uploaded pick camera buffer; the per-source loop
   * simply issues no draws.
   *
   * The `@group(2)` bind-group cache is keyed by GPUBuffer identity, so
   * a tier swap that destroys an old sourceBuffer invalidates the
   * cached bind group via GC.
   */
  function drawPoints(
    pass: GPURenderPassEncoder,
    sources: readonly PickSourceDraw[],
    pointSizePx: number,
    uniformBytes: ArrayBuffer,
  ): void {
    // Full upload: reproduce the rendered camera / viewport / settings
    // state on the pick renderer's OWN buffer.  The visual
    // pass's GPU buffer is never touched — this is the invariant that
    // eliminates the two-writer bug.
    device.queue.writeBuffer(pickUniformBuffer, 0, uniformBytes);

    // Three pick-specific overrides applied on top of the base upload:
    //   - `selectedPacked` → none-sentinel: stops the 8× selection-ring
    //     scaling from inflating the hit area for the selected galaxy.
    //   - `pointSizePx` + PICK_PADDING_PX: widens click targets for
    //     far-field point-like galaxies without growing visible sprites.
    //   - `pickPass` = 1: shared vertex shader skips crossfade-OUT and
    //     intensity-floor culls so disk-sized galaxies stay pickable.
    device.queue.writeBuffer(
      pickUniformBuffer,
      SELECTED_PACKED_BYTE_OFFSET,
      new Uint32Array([SELECTION_NONE_SENTINEL]),
    );
    device.queue.writeBuffer(
      pickUniformBuffer,
      POINT_SIZE_BYTE_OFFSET,
      new Float32Array([pointSizePx + PICK_PADDING_PX]),
    );
    device.queue.writeBuffer(pickUniformBuffer, PICK_PASS_BYTE_OFFSET, new Uint32Array([1]));

    // Bind the prebuilt @group(0) bind group (built once at construction
    // against pickUniformBuffer — avoids per-draw createBindGroup calls).
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, pickUniformBindGroup);
    pass.setBindGroup(1, dummyFadeBindGroup);
    pass.setBindGroup(3, focusBindGroup);

    for (const src of sources) {
      let sourceBindGroup = sourceBindGroupCache.get(src.sourceBuffer);
      if (!sourceBindGroup) {
        sourceBindGroup = device.createBindGroup({
          label: `pick-source-${src.source}`,
          layout: sourceBgl,
          entries: [{ binding: 0, resource: { buffer: src.sourceBuffer } }],
        });
        sourceBindGroupCache.set(src.sourceBuffer, sourceBindGroup);
      }
      pass.setBindGroup(2, sourceBindGroup);
      pass.setVertexBuffer(0, src.vertexBuffer);
      pass.draw(6, src.count);
    }
  }

  /**
   * Re-bind `@group(0)` to the point-pick camera uniform bind group (built
   * once at construction against `pickUniformBuffer`, whose bytes `drawPoints`
   * last uploaded).
   *
   * This exists so any `drawPick` that binds its own slot-0 uniform — the
   * procedural-disk pick binds the disk camera at `@group(0)` — can restore
   * the shared camera prefix before sibling fold-ins that read that prefix but
   * bind nothing themselves. Without the restore they read the disk's leftover
   * uniform (and fail validation once a mirror's read extent exceeds it).
   */
  function bindCamera(pass: GPURenderPassEncoder): void {
    pass.setBindGroup(0, pickUniformBindGroup);
  }

  function destroy(): void {
    dummyFadeBuffer.destroy();
    pickUniformBuffer.destroy();
    // focusBindGroup wraps the engine-owned shared focus buffer; the
    // engine's destroy() releases it, not the picker.
  }

  const renderer: PickRenderer = {
    label: 'pickRenderer',
    drawPoints,
    bindCamera,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
