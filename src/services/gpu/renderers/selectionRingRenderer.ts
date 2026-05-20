/**
 * selectionRingRenderer — per-galaxy selection halo overlay renderer.
 * Lives in `UI_PASSES` (premultiplied-OVER, post-tone-map) via
 * `selectionRingPass`.
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
 * moved. Split bindings let each upload at its own cadence: camera per
 * frame, selection only when the user picks.
 *
 * ## Blend mode
 *
 * Premultiplied-alpha OVER (`src: one, dst: one-minus-src-alpha`). The
 * ring is UI overlay, not emissive: at alpha=0 it should fully reveal
 * the swap chain underneath, not double-expose.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { SelectionRingRenderer } from '../../../@types/rendering/SelectionRingRenderer';
import vsCode from '../shaders/selectionRing/vertex.wesl?static';
import fsCode from '../shaders/selectionRing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/** Shared CameraUniforms prefix — viewProj(64) + viewportPx(8) + pads(8). */
const CAMERA_UNIFORM_BYTES = 80;

/** SelectionRingUniforms: vec3<f32> worldPos + f32 ringRadiusPx. */
const SELECTION_UNIFORM_BYTES = 16;

export function createSelectionRingRenderer(ctx: GpuContext): SelectionRingRenderer {
  // The cast lets a test pass `device: null as unknown as GPUDevice`
  // through. Runtime null-checks below gate every GPU call.
  const device = ctx.device as GPUDevice | null;
  const format = ctx.format;

  let currentSelection: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null = null;

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
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
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

  function setSelection(value: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null): void {
    currentSelection = value;
  }

  function hasSelection(): boolean {
    return currentSelection !== null;
  }

  function render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void {
    if (!device || !pipeline || !bindGroup || !cameraBuffer || !selectionBuffer) return;
    if (currentSelection === null) return;

    // Camera UBO: viewProj at [0..15], viewportPx at [16..17], pads zero
    // by virtue of Float32Array zero-init.
    const camUni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    camUni.set(viewProj, 0);
    camUni[16] = viewportSize[0];
    camUni[17] = viewportSize[1];
    device.queue.writeBuffer(cameraBuffer, 0, camUni);

    const selUni = new Float32Array(SELECTION_UNIFORM_BYTES / 4);
    selUni[0] = currentSelection.worldPos[0];
    selUni[1] = currentSelection.worldPos[1];
    selUni[2] = currentSelection.worldPos[2];
    selUni[3] = currentSelection.ringRadiusPx;
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
    setSelection,
    hasSelection,
    render,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
