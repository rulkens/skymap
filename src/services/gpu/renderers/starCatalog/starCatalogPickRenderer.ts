/**
 * starCatalogPickRenderer — the r32uint pick provider for the survey (Gaia bin)
 * stars, the pick twin of `starCatalogRenderer`.
 *
 * It records one source's leaf cut into an already-begun r32uint pick pass,
 * where each fragment stamps the picked star's packed identity
 * (`(SOURCE_GAIA_STARS << 27) | recordIdx`, see `starCatalog/pickFragment.wesl`).
 * It owns no pass, no texture and no readback — the pick program begins the pass
 * and drives the readback; this renderer is one `drawPick` provider among the
 * pickable rows, the star analogue of the galaxy points `galaxyPickRenderer`.
 *
 * ### What it shares with the visual renderer, and what it owns
 *
 * The visual `starCatalogRenderer` exposes `pickResources()` — its three
 * explicit bind-group layouts plus a per-source records bind group. This
 * renderer builds an EXPLICIT pick pipeline layout from those exact BGLs, so its
 * pipeline is group-equivalent to the visual one and the shared records bind
 * group (@group(2), the record blob uploaded ONCE by the visual renderer) is
 * valid on it. The record bytes are therefore identical between the two
 * pipelines — the pick draw re-uses them rather than re-uploading.
 *
 * Everything WRITTEN per frame, this renderer owns: its OWN `StarUniforms`
 * buffer (with `pickPass = 1`) and its OWN per-source nodeParams/prefix buffers.
 * That ownership is the writeBuffer/submit landmine fix — a pick draw encoded
 * into the pick pass in the same frame as a visual draw must never write the
 * visual renderer's live buffers, or the queued writes would race at submit and
 * the pick would read the visual frame's params. The visual buffers are never
 * touched here.
 *
 * ### Leaf-only, depth-tested
 *
 * Only the leaf stream is pickable: a picked star is always a real-star record,
 * so an aggregate glow (which stands in for a whole subtree) has no single star
 * to name. Every NodeParams block is therefore packed `isAggregate = 0`, which
 * makes the vertex stage size each record as a floor-sized point (its box extent
 * is zeroed) rather than a box-filling glow. Unlike the depthless additive
 * visual star pass, the pick pipeline is DEPTH-tested (`depth32float` =
 * `NEAR0_DEPTH_FORMAT`, `depthCompare: 'greater'` — the NEAR0 slab's reversed-Z
 * convention, clear `0.0`, greater-z-wins — `depthWriteEnabled: true`) so the
 * nearest star wins the pixel — a bright star in front of a dim one claims the
 * pick, matching visual occlusion.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type {
  StarCatalogPickRenderer,
  StarCatalogPickDrawArgs,
} from '../../../../@types/rendering/StarCatalogPickRenderer';
import type { StarCatalogPickResources } from '../../../../@types/rendering/StarCatalogRenderer';
import type { SourceType } from '../../../../@types/data/SourceType';
import vsCode from '../../shaders/starCatalog/vertex.wesl?static';
import pickFsCode from '../../shaders/starCatalog/pickFragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { sphereOutsideFrustum } from '../../../../utils/camera/sphereOutsideFrustum';
// The NodeParams / StarUniforms byte layout lives in ONE home both star
// renderers import — see starCatalogLayout.ts (the WESL structs in
// shaders/starCatalog/io.wesl are the source of truth). This pick renderer is
// the ONLY writer of `pickPass` (u32 index 23 = 1), which flips the vertex
// stage's clickable-footprint floor on and routes the record identity to the
// pick fragment.
import {
  NODE_PARAMS_BYTES,
  PREFIX_BYTES,
  STAR_UNIFORM_BYTES,
  SIZE_PX_FLOAT_INDEX,
  BRIGHTNESS_FLOAT_INDEX,
  GLOW_OVERLAP_FLOAT_INDEX,
  PICK_PASS_U32_INDEX,
  writeStarNodeParams,
} from './starCatalogLayout';

/**
 * One source's per-source pick buffers: the contiguous NodeParams block and its
 * parallel prefix sum, plus their shared grow-only capacity. Distinct per source
 * so multiple sources drawn into the same pick pass cannot clobber each other's
 * bytes at submit (the writeBuffer/submit landmine).
 */
type PickBuffers = {
  nodeParamsBuffer: GPUBuffer | null;
  prefixBuffer: GPUBuffer | null;
  drawCapacity: number;
};

export function createStarCatalogPickRenderer(
  device: GPUDevice,
  /**
   * The visual star renderer's shared resources: the three explicit BGLs (so the
   * pick pipeline layout is group-equivalent) plus the per-source records bind
   * group the pick draw binds verbatim at @group(2).
   */
  resources: StarCatalogPickResources,
  /**
   * Selects the NEAR0 slab's depth convention (single-sourced in
   * `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
   * `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
   */
  reversedZ: boolean,
): StarCatalogPickRenderer {
  const { cameraBgl, drawBgl, recordsBgl } = resources;

  // Own r32uint pick pipeline. Separate GPUShaderModule per pipeline (never
  // shared across pipelines — the WebGPU 'auto'-layout trap); explicit layout
  // built from the visual renderer's BGLs so the shared records bind group stays
  // compatible.
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'starCatalogPick.vertex');
  const fsModule = createShaderModuleWithDevLog(device, pickFsCode, 'starCatalogPick.pickFragment');

  const pipelineLayout = device.createPipelineLayout({
    label: 'star-catalog-pick-pipeline-layout',
    bindGroupLayouts: [cameraBgl, drawBgl, recordsBgl],
  });

  const pipeline = device.createRenderPipeline({
    label: 'star-catalog-pick-pipeline',
    layout: pipelineLayout,
    vertex: { module: vsModule, entryPoint: 'vs' }, // records vertex-pulled, no vertex buffers
    fragment: {
      module: fsModule,
      entryPoint: 'fsPick',
      // r32uint: no blend (integer formats can't be blended). Depth resolves
      // overlapping stars instead.
      targets: [{ format: 'r32uint' }],
    },
    // Three vertices per instanced circumscribing-triangle billboard — lockstep
    // with the visual pipeline's draw(3, N) and the shared vertex stage's
    // triCorner, which only defines corners for vertex_index 0..2.
    primitive: { topology: 'triangle-list' },
    // Depth-tested so the nearest star wins the pixel (the visual pass is
    // depthless additive; the pick needs a single claimant). depth32float
    // matches the NEAR0 pick pass's depth attachment (NEAR0_DEPTH_FORMAT in
    // pickProgram.ts — a mismatched format is a validation error).
    // `depthWriteEnabled` must be true or every fragment passes.
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // Own @group(0) StarUniforms buffer (pickPass = 1). Built once; `draw`
  // re-uploads its bytes per pick. Never the visual renderer's buffer — the
  // two-writer corruption this design deletes.
  const uniformBuffer = device.createBuffer({
    label: 'star-catalog-pick-uniform',
    size: STAR_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformBindGroup = device.createBindGroup({
    label: 'star-catalog-pick-uniform-bg',
    layout: cameraBgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  // One ArrayBuffer viewed as both f32 (camera prefix + size/brightness/overlap)
  // and u32 (pickPass), aliasing the same bytes at distinct indices.
  const uniformScratch = new ArrayBuffer(STAR_UNIFORM_BYTES);
  const uniformF32 = new Float32Array(uniformScratch);
  const uniformU32 = new Uint32Array(uniformScratch);
  // pickPass is a per-draw constant of this renderer — set once here.
  uniformU32[PICK_PASS_U32_INDEX] = 1;
  // brightness / glowOverlap do not affect leaf pick GEOMETRY (brightness only
  // scales the unused peak; glowOverlap only widens AGGREGATE glows, and every
  // leaf selects 1.0 regardless), but set them to the identity so the uniform is
  // fully defined rather than carrying stale scratch. 'aggregateIntensityCap'
  // (the next scalar) is left at its zero-init default: it clamps AGGREGATE peaks
  // only, and this pipeline draws leaves, so the vertex stage never consults it.
  uniformF32[BRIGHTNESS_FLOAT_INDEX] = 1.0;
  uniformF32[GLOW_OVERLAP_FLOAT_INDEX] = 1.0;

  // Per-source pick buffers (see `PickBuffers`).
  const sourceBuffers = new Map<SourceType, PickBuffers>();

  // Per-draw CPU scratch, grown as the frame's draw count grows. queue.writeBuffer
  // snapshots synchronously, so reuse across sources within a frame is safe.
  let nodeScratch = new ArrayBuffer(0);
  let nodeScratchView = new DataView(nodeScratch);
  let prefixScratch = new Uint32Array(0);

  function ensureScratch(drawCount: number): void {
    const needed = drawCount * NODE_PARAMS_BYTES;
    if (nodeScratch.byteLength < needed) {
      nodeScratch = new ArrayBuffer(needed);
      nodeScratchView = new DataView(nodeScratch);
    }
    if (prefixScratch.length < drawCount) {
      prefixScratch = new Uint32Array(drawCount);
    }
  }

  /**
   * Grow one source's NodeParams + prefix buffers to hold `drawCount` slots
   * (grow-only — GPU buffers are fixed-size, so re-create only past capacity).
   */
  function ensureDrawBuffers(source: SourceType, drawCount: number): PickBuffers {
    let buffers = sourceBuffers.get(source);
    if (buffers && buffers.nodeParamsBuffer !== null && buffers.drawCapacity >= drawCount) {
      return buffers;
    }
    buffers?.nodeParamsBuffer?.destroy();
    buffers?.prefixBuffer?.destroy();
    buffers = {
      drawCapacity: drawCount,
      nodeParamsBuffer: device.createBuffer({
        label: `star-catalog-pick-node-params-${source}`,
        size: drawCount * NODE_PARAMS_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      prefixBuffer: device.createBuffer({
        label: `star-catalog-pick-prefix-${source}`,
        size: drawCount * PREFIX_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    };
    sourceBuffers.set(source, buffers);
    return buffers;
  }

  function draw(pass: GPURenderPassEncoder, args: StarCatalogPickDrawArgs): void {
    const {
      source,
      vp,
      viewportPx,
      drawCount,
      firstRecord,
      recordCount,
      originRelCamMpc,
      cellScaleMpc,
      sizePx,
      frustumPlanes,
      glowMarginAngleRad,
    } = args;
    const recordsBindGroup = resources.recordsBindGroup(source);
    if (!recordsBindGroup || drawCount === 0) return;

    // Own uniform: camera prefix + sizePx + the already-set pickPass = 1 /
    // brightness / glowOverlap. Written to this renderer's OWN buffer — the
    // visual pass's buffer is never touched.
    writeCameraPrefix(uniformF32, vp, viewportPx);
    uniformF32[SIZE_PX_FLOAT_INDEX] = sizePx;
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    // Pack every SURVIVING leaf draw's NodeParams contiguously + the exclusive
    // prefix sum, mirroring the visual renderer's packing but with pick-fixed
    // fields: isAggregate = 0 (point-source leaf), subtreeStarCount = 1 (one star
    // per leaf record), opacity = 1 (the pick fragment ignores it). Culled leaves
    // are skipped entirely, so a separate output cursor `survivors` (≠ the loop
    // index `i`) keeps the packing contiguous — every buffer size, upload length
    // and bind size below is that survivor count, and `totalInstances` (the
    // running sum's end) is the single draw's instance count over survivors only.
    // Scratch is sized to the worst case (`drawCount` ≥ survivors) before the loop.
    ensureScratch(drawCount);
    let totalInstances = 0;
    let survivors = 0;
    for (let i = 0; i < drawCount; i++) {
      // The per-node arrays are the leaf draw-list's compacted flat typed arrays —
      // scalars index `i`, the origin vec3 indexes `3*i`.
      const o = i * 3;
      const ox = originRelCamMpc[o]!;
      const oy = originRelCamMpc[o + 1]!;
      const oz = originRelCamMpc[o + 2]!;
      const edge = cellScaleMpc[i]!;

      // Frustum cull (skipped when `frustumPlanes` is null — culling disabled).
      // The camera is the rebase origin, so node positions are camera-relative:
      // `originRelCamMpc` is the box MIN corner and records span [origin,
      // origin+edge) per axis, hence centre = origin + edge/2, half-diagonal =
      // edge·√3/2, and distance from the eye = length(centre). This path is
      // leaf-only (every node is `isAggregate = 0`), so the LEAF branch of the
      // cull-radius contract is the only one: a leaf draws as a fixed-pixel
      // clickable dot, so its world spill is angular — `length(centre) ·
      // glowMarginAngleRad`. Conservative is safe: a false "inside" merely draws
      // an off-screen (unclickable) node, a false "outside" would make a visible
      // star unclickable (forbidden), so the radius only ever grows the sphere.
      if (frustumPlanes !== null) {
        const cx = ox + edge * 0.5;
        const cy = oy + edge * 0.5;
        const cz = oz + edge * 0.5;
        const baseRadius = edge * 0.8660254; // edge·√3/2
        const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const cullRadius = baseRadius + dist * glowMarginAngleRad;
        if (sphereOutsideFrustum(frustumPlanes, cx, cy, cz, cullRadius)) continue;
      }

      // Same byte layout as the visual packer, with pick-fixed fields: opacity 1
      // (ignored by the pick fragment), isAggregate 0 (point-source leaf),
      // subtreeStarCount 1 (one star per leaf record). `writeStarNodeParams` owns
      // the offsets; the survivor is packed at the output cursor, not `i`.
      writeStarNodeParams(
        nodeScratchView,
        survivors * NODE_PARAMS_BYTES,
        ox,
        oy,
        oz,
        edge,
        firstRecord[i]!,
        1.0,
        0,
        1.0,
      );
      prefixScratch[survivors] = totalInstances;
      totalInstances += recordCount[i]!;
      survivors++;
    }

    // Every leaf culled ⇒ nothing to draw: return before any GPU work (the second
    // early return after the records/`drawCount === 0` guard above).
    if (survivors === 0) return;

    const buffers = ensureDrawBuffers(source, survivors);
    device.queue.writeBuffer(
      buffers.nodeParamsBuffer!,
      0,
      nodeScratch,
      0,
      survivors * NODE_PARAMS_BYTES,
    );
    device.queue.writeBuffer(buffers.prefixBuffer!, 0, prefixScratch, 0, survivors);

    // Bind group rebuilt per frame with the EXACT bound size (grow-only buffers
    // may over-allocate) so the shader's `arrayLength(&prefix)` yields exactly
    // `survivors`.
    const drawBindGroup = device.createBindGroup({
      label: `star-catalog-pick-draw-bg-${source}`,
      layout: drawBgl,
      entries: [
        {
          binding: 0,
          resource: { buffer: buffers.nodeParamsBuffer!, size: survivors * NODE_PARAMS_BYTES },
        },
        { binding: 1, resource: { buffer: buffers.prefixBuffer!, size: survivors * PREFIX_BYTES } },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, drawBindGroup);
    pass.setBindGroup(2, recordsBindGroup);
    // ONE instanced draw for the whole leaf cut — the shared vertex stage routes
    // each instance to its owning draw slot via the prefix-sum binary search.
    pass.draw(3, totalInstances);
  }

  function destroy(): void {
    for (const buffers of sourceBuffers.values()) {
      buffers.nodeParamsBuffer?.destroy();
      buffers.prefixBuffer?.destroy();
    }
    sourceBuffers.clear();
    uniformBuffer.destroy();
    // The records bind groups are owned (and destroyed) by the visual renderer.
  }

  const renderer: StarCatalogPickRenderer = {
    label: 'starCatalogPickRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
