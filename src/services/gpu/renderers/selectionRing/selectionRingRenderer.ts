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
import fsOccludeCode from '../../shaders/selectionRing/fragmentOcclude.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import {
  OCCLUSION_COVERAGE_GROUP_INDEX,
  OCCLUSION_COVERAGE_LAYOUT_DESC,
  createOcclusionCoverageBindGroup,
} from '../labels/occlusionCoverageGroup';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';

/** SelectionRingUniforms: vec3<f32> worldPos + f32 ringRadiusPx. */
const SELECTION_UNIFORM_BYTES = 16;

/**
 * Construct a `SelectionRingRenderer`. `targetFormat` is the colour-attachment
 * format the pipeline writes into; the ring is a post-tone-map UI overlay, so
 * this is the swap-chain format — passed EXPLICITLY rather than read off
 * `ctx.format`, so the target is legible at the construction site.
 *
 * `init.occludeAgainstScene` opts this instance into per-pixel attenuation
 * behind the solar-system bodies. When set, the pipeline gains a group(1)
 * coverage binding (`OCCLUSION_COVERAGE_LAYOUT_DESC`) and compiles
 * `fragmentOcclude.wesl` alongside the plain entry; `draw` then selects the
 * occlude pipeline on any frame handed a scene colour view. The default (init
 * omitted) keeps the plain single-BGL pipeline the NEAR0 selection ring relies
 * on — byte-for-byte unchanged, since that sibling passes no colour view.
 */
export function createSelectionRingRenderer(
  ctx: GpuContext,
  targetFormat: GPUTextureFormat,
  init?: { occludeAgainstScene?: boolean },
): SelectionRingRenderer {
  // The cast lets a test pass `device: null as unknown as GPUDevice`
  // through. Runtime null-checks below gate every GPU call.
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;

  // The occlusion instance builds BOTH pipelines and picks per-draw:
  // `plainPipeline` (single BGL) whenever no scene colour is supplied this
  // frame, `occludePipeline` (two BGLs, scene-attenuated fragment) when it is. A
  // non-occlusion instance builds only `plainPipeline` and leaves the other
  // null — which is what keeps the NEAR0 sibling's draws byte-identical.
  let plainPipeline: GPURenderPipeline | null = null;
  let occludePipeline: GPURenderPipeline | null = null;
  let cameraBuffer: GPUBuffer | null = null;
  let selectionBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;
  // Retained only on the occlusion path — the group(1) coverage BGL that
  // `draw` rebuilds a per-frame bind group against (the colour view changes
  // on every resize — see occlusionCoverageGroup.ts). Null on the plain path
  // (and whenever device is null), which is what gates `draw`'s occlusion
  // branch.
  let occlusionCoverageBGL: GPUBindGroupLayout | null = null;

  const occludesScene = init?.occludeAgainstScene === true;

  if (device) {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'selection-ring-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    // Occlusion joint (opt-in): a second bind-group layout at group 1 (the
    // shared coverage joint). Retained so `draw` can rebuild its per-frame
    // bind group from the resize-recreated colour view.
    if (occludesScene) {
      occlusionCoverageBGL = device.createBindGroupLayout(OCCLUSION_COVERAGE_LAYOUT_DESC);
    }

    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'selectionRing.vertex');
    const fsModule = createShaderModuleWithDevLog(device, fsCode, 'selectionRing.fragment');

    // Both pipelines draw the identical geometry into the identical target;
    // only the fragment entry and the group(1) coverage binding differ, so the
    // colour-target descriptor is shared.
    const colorTargets: GPUColorTargetState[] = [{ format, blend: PREMULTIPLIED_OVER_BLEND }];

    plainPipeline = device.createRenderPipeline({
      label: 'selection-ring-pipeline',
      layout: device.createPipelineLayout({
        label: 'selection-ring-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module: vsModule, entryPoint: 'vs' },
      fragment: { module: fsModule, entryPoint: 'fs', targets: colorTargets },
      primitive: { topology: 'triangle-list' },
    });

    if (occlusionCoverageBGL) {
      const fsOccludeModule = createShaderModuleWithDevLog(
        device,
        fsOccludeCode,
        'selectionRing.fragmentOcclude',
      );
      occludePipeline = device.createRenderPipeline({
        label: 'selection-ring-pipeline-occlude',
        layout: device.createPipelineLayout({
          label: 'selection-ring-pipeline-occlude-layout',
          // group 0 = the selection-ring BGL; group 1 = the shared coverage joint.
          bindGroupLayouts: [bindGroupLayout, occlusionCoverageBGL],
        }),
        vertex: { module: vsModule, entryPoint: 'vs' },
        fragment: { module: fsOccludeModule, entryPoint: 'fs', targets: colorTargets },
        primitive: { topology: 'triangle-list' },
      });
    }

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
    sceneColorView?: GPUTextureView,
  ): void {
    if (!device || !plainPipeline || !bindGroup || !cameraBuffer || !selectionBuffer) return;
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

    // Pipeline selection: an occlusion instance draws through its occlusion
    // pipeline only when a scene colour view is supplied THIS frame, binding the
    // group(1) coverage joint rebuilt from that view. With no colour view (e.g.
    // the NEAR0 sibling, or a COSMO frame in which no foreground body
    // rendered), it falls back to the plain pipeline and draws the ring
    // un-occluded — a valid draw, NOT an occlusion draw with group(1) left
    // unbound. A non-occlusion instance (occludePipeline null) always takes
    // the plain path.
    if (occlusionCoverageBGL && occludePipeline && sceneColorView) {
      pass.setPipeline(occludePipeline);
      pass.setBindGroup(0, bindGroup);
      const coverageBindGroup = createOcclusionCoverageBindGroup(
        device,
        occlusionCoverageBGL,
        sceneColorView,
      );
      pass.setBindGroup(OCCLUSION_COVERAGE_GROUP_INDEX, coverageBindGroup);
    } else {
      pass.setPipeline(plainPipeline);
      pass.setBindGroup(0, bindGroup);
    }
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
