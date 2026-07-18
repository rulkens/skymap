/**
 * selectionRingRenderer — per-galaxy selection halo overlay renderer.
 * Drawn as a swap-target layer (premultiplied-OVER, post-tone-map) by
 * `selectionRingLayer`.
 *
 * ## Why a separate renderer instead of folding into points
 *
 * The main-points fragment otherwise carries a 90-line selection branch
 * paid by every fragment. Of ~2.5 M point fragments per frame, exactly
 * one galaxy ever satisfies that branch. The vertex stage similarly
 * carries a `selected` varying, a `sizeScale` factor, and an
 * invisibility-cull bypass — one-instance behaviour billed against every
 * instance. Splitting into a one-instance draw call removes that
 * overhead and reduces the points shader to its actual job.
 *
 * ## Why a factory closure
 *
 * Convention every lightweight renderer follows here. See
 * `markerLineRenderer.ts` for the rationale; we apply it verbatim.
 *
 * ## Why two uniform bindings
 *
 * Camera prefix is 80 bytes; selection tail is 16. Combining would force
 * a 96-byte writeBuffer every frame even when the selection hasn't
 * moved. Split bindings keep the two concerns separable. The selection
 * is not renderer-held state — the caller passes it to `draw`, and the
 * pass already gates `draw` to frames where something is selected, so
 * the selection UBO uploads once per frame the pass draws.
 *
 * ## Blend mode
 *
 * Premultiplied-alpha OVER (`src: one, dst: one-minus-src-alpha`). The
 * ring is UI overlay, not emissive: at alpha=0 it should fully reveal
 * the swap chain underneath, not double-expose.
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SelectionRingRenderer } from '../../../../@types/rendering/SelectionRingRenderer';
import vsCode from '../../shaders/selectionRing/vertex.wesl?static';
import fsCode from '../../shaders/selectionRing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';

/** SelectionRingUniforms: vec3<f32> worldPos + f32 ringRadiusPx. */
const SELECTION_UNIFORM_BYTES = 16;

/**
 * Construct a `SelectionRingRenderer`. `targetFormat` is the colour-attachment
 * format the pipeline writes into; the ring is a post-tone-map UI overlay, so
 * this is the swap-chain format — passed EXPLICITLY rather than read off
 * `ctx.format`, so the target is legible at the construction site.
 */
export function createSelectionRingRenderer(
  ctx: GpuContext,
  targetFormat: GPUTextureFormat,
): SelectionRingRenderer {
  // The cast lets a test pass `device: null as unknown as GPUDevice`
  // through. Runtime null-checks below gate every GPU call.
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;

  let pipeline: GPURenderPipeline | null = null;
  let cameraBuffer: GPUBuffer | null = null;
  let selectionBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;

  if (device) {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'selection-ring-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'selectionRing.vertex');
    const fsModule = createShaderModuleWithDevLog(device, fsCode, 'selectionRing.fragment');

    pipeline = device.createRenderPipeline({
      label: 'selection-ring-pipeline',
      layout: device.createPipelineLayout({
        label: 'selection-ring-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module: vsModule, entryPoint: 'vs' },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: PREMULTIPLIED_OVER_BLEND,
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    cameraBuffer = device.createBuffer({
      label: 'selection-ring-camera',
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    selectionBuffer = device.createBuffer({
      label: 'selection-ring-selection',
      size: SELECTION_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    bindGroup = device.createBindGroup({
      label: 'selection-ring-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: selectionBuffer } },
      ],
    });
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    selection: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null,
  ): void {
    if (!device || !pipeline || !bindGroup || !cameraBuffer || !selectionBuffer) return;
    if (selection === null) return;

    // Camera UBO: viewProj at [0..15], viewportPx at [16..17], pads zero
    // by virtue of Float32Array zero-init.
    const camUni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    writeCameraPrefix(camUni, viewProj, viewportSize);
    device.queue.writeBuffer(cameraBuffer, 0, camUni);

    const selUni = new Float32Array(SELECTION_UNIFORM_BYTES / 4);
    selUni[0] = selection.worldPos[0];
    selUni[1] = selection.worldPos[1];
    selUni[2] = selection.worldPos[2];
    selUni[3] = selection.ringRadiusPx;
    device.queue.writeBuffer(selectionBuffer, 0, selUni);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1, 0, 0);
  }

  function destroy(): void {
    cameraBuffer?.destroy();
    selectionBuffer?.destroy();
  }

  const renderer: SelectionRingRenderer = {
    label: 'selectionRingRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
