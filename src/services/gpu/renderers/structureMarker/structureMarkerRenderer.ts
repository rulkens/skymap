/**
 * structureMarkerRenderer — instanced halo + ring overlay for every
 * `type:'structure'` category: cluster, supercluster, void, and group.
 * The producer (`produceStructureMarkers`) feeds it descriptors; the
 * store it visualises is `state.data.structures`.
 *
 * ### Why one renderer for three pipelines?
 *
 * Halo, ring, and ringPick share the same per-instance data (position,
 * radius, tints, alphas) and the same camera uniform; only the fragment
 * math differs (additive radial gradient vs. screen-AA ring vs. pick
 * encode).  One renderer owning all three pipelines + one shared
 * instance buffer lets `setMarkers` upload once per frame, versus
 * parallel instance buffers per pipeline.
 *
 * ### One draw per category
 *
 * `draw`/`pickRing` partition descriptors by category and issue one
 * instanced draw per non-empty bucket, binding that category's
 * SourceUniforms at `@group(2)`.  The uniform carries the category's
 * 5-bit `sourceCode`, which the ringPick fragment composes into
 * `(sourceCode << 27) | structureIndex + PICK_SENTINEL_OFFSET` — the same
 * per-source pattern `galaxyPointRenderer` uses per galaxy catalog.  Buckets are
 * data-driven from `STRUCTURE_IDS`, so a new structure source
 * needs no change here.
 *
 * Voids skip the halo draw — a halo implies matter where the structure
 * is defined by absence.  The descriptor's `haloColor` alpha 0 is the
 * gate; the descriptor still flows into the partition for ring + pick.
 *
 * ### CPU-only mode
 *
 * Constructed with a null device for unit tests.  GPU resource
 * allocation is guarded by `if (device)` so `setMarkers` packs the
 * CPU scratch buffer + bumps the counter without touching the GPU.
 * Mirrors `markerLineRenderer.ts`'s null-device pattern.
 *
 * ### Pipeline layout
 *
 * Each pipeline gets its own GPUShaderModule (never share one across
 * pipelines — WebGPU `layout:'auto'` bites otherwise; see the MEMORY
 * note `feedback_webgpu_auto_layout_trap.md`).  All share an EXPLICIT
 * pipeline layout — CameraUniforms BGL at `@group(0)`, a placeholder
 * FadeUniforms BGL at `@group(1)` (unused by these shaders but it must
 * match whatever a prior HDR pass left bound at slot 1), SourceUniforms
 * BGL at `@group(2)` — so one `device.createBindGroup(...)` is valid
 * against every pipeline (which `layout:'auto'` does NOT guarantee).
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { StructureMarkerRenderer } from '../../../../@types/rendering/StructureMarkerRenderer';
import type { StructureMarkerDescriptor } from '../../../../@types/rendering/StructureMarkerDescriptor';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import { STRUCTURE_IDS, STRUCTURE_ID_CODES } from '../../../../data/structure/structureIds';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { Vec2 } from '../../../../@types/math/Vec2';
import haloVsCode from '../../shaders/structureMarker/halo.wesl?static';
import haloFsCode from '../../shaders/structureMarker/halo.wesl?static';
import ringVsCode from '../../shaders/structureMarker/ring.wesl?static';
import ringFsCode from '../../shaders/structureMarker/ring.wesl?static';
import ringPickVsCode from '../../shaders/structureMarker/ring.wesl?static';
import ringPickFsCode from '../../shaders/structureMarker/ringPick.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND, PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';
import { createDummyFadeBindGroup } from '../../lib/dummyFade';

/**
 * 12 floats per instance × 4 bytes = 48 bytes/instance.
 *
 * Layout (matches VsIn in structureMarker/io.wesl):
 *   [0..2]   position.xyz       — world-space centre
 *   [3]      radiusMpc          — world-space half-extent (ring + halo)
 *   [4..7]   haloColor.rgba     — additive halo tint + final alpha
 *   [8..11]  ringColor.rgba     — ring tint + final alpha
 *
 * Halo and ring carry independent RGB tints so voids — which opt out
 * of the additive halo entirely (haloAlpha = 0) — can still display
 * their cyan ring without falling back to halo's (0, 0, 0).  Sharing
 * halo's RGB across both pipelines would save stride but can't
 * express that void colour split.
 */
const MARKER_INSTANCE_FLOATS = 12;
const MARKER_INSTANCE_BYTES = MARKER_INSTANCE_FLOATS * 4;

/** SourceUniforms = u32 sourceCode + 12 bytes pad = 16 bytes. */
const SOURCE_UNIFORM_BYTES = 16;

/** A per-category bag seeded to `init` — a new structure source can't leave a bucket unset. */
function byCategory<T>(init: T): Record<StructureId, T> {
  return Object.fromEntries(STRUCTURE_IDS.map((c) => [c, init])) as Record<StructureId, T>;
}

export function createStructureMarkerRenderer(
  ctx: GpuContext,
  /**
   * The colour-attachment format the halo + ring pipelines write into.
   * `structureMarkersLayer` draws into the hdr target, so the format is the
   * offscreen HDR target (`rgba16float`) — NOT `ctx.format`, which is the canvas
   * swap-chain (`bgra8unorm`).  Halos accumulate additively into the same
   * float buffer the points / quads / disks / filaments write, then the
   * tone-map pass compresses everything onto the swap chain.  Passing
   * `ctx.format` here would trip a WebGPU validation error at draw time
   * (`attachment state … is not compatible with [RenderPassEncoder]`).
   * Mirrors the `targetFormat` parameter on `createFilamentRenderer`.
   */
  targetFormat: GPUTextureFormat,
  /**
   * The shared `FadeUniformsBgl` other HDR renderers (filaments, etc.)
   * use at `@group(1)`.  This renderer's shaders DO NOT reference
   * `@group(1)`, but the slot must still appear in the pipeline layout
   * AND match the BindGroupLayout of any BindGroup other passes have
   * already bound at slot 1 in the same `RenderPassEncoder`.  Without
   * passing the canonical fadeBgl here, the previous pass's bound
   * `filaments-fade-bg` would mismatch our placeholder layout and the
   * validator would reject our SetPipeline.  Mirrors the fadeBgl arg
   * on `createFilamentRenderer`.
   */
  fadeBgl: FadeUniformsBgl,
  /**
   * Selects the COSMO slab's depth convention (single-sourced in
   * `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
   * `true` ⇒ reversed-Z greater-wins. Applies to the ring-pick pipeline's
   * depth test, resolved through `resolveDepthCompare`.
   */
  reversedZ: boolean,
  initialCapacity = 64,
): StructureMarkerRenderer {
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;

  // Per-instance capacity.  This is an INITIAL hint, not a hard cap:
  // `setMarkers` grows both the CPU scratch buffer and the GPU vertex
  // buffer (see growTo) to fit whatever descriptor count it's handed.
  //
  // Why grow rather than cap: produceMarkers emits one descriptor per
  // marker-bearing structure of a visible category EVERY frame — including
  // fully-faded ones (the emit-all-then-discard contract that keeps the
  // ring-pick instance_index aligned with getStructuresForCategory).  So the
  // count is data-driven (~660 with the M500 ≥ 1.0 cluster cut, more if
  // the catalog grows).  A fixed cap would silently truncate the tail in
  // structure order, both dropping whole categories off-screen (clusters
  // saturate the buffer first, so superclusters and voids never get
  // packed — visible only with clusters toggled off) AND desyncing the
  // per-category pick index.  Growing keeps the renderer correct for
  // any catalog size; the buffer is tiny (660 × 48 B ≈ 31 KB).
  let capacity = initialCapacity;
  let instanceBuf = new Float32Array(capacity * MARKER_INSTANCE_FLOATS);
  let currentMarkerCount = 0;

  // Per-category bucket bookkeeping: where each category's run begins
  // in the instance buffer + how many descriptors it owns.  Reset at
  // the start of every setMarkers call.
  const bucketOffsets = byCategory(0);
  const bucketCounts = byCategory(0);

  // GPU resources — null when device is null.
  let haloPipeline: GPURenderPipeline | null = null;
  let ringPipeline: GPURenderPipeline | null = null;
  // Ring-pick pipeline — same vertex source as ringPipeline, fragment
  // swapped to ringPick.wesl's fsRingPick + colour target swapped to
  // r32uint + depth24plus added.  See the pick pipeline build below for
  // the full rationale; in short, this is the structure-marker sibling of the
  // galaxy pick path in galaxyPickRenderer.ts.  The engine's pick pass will
  // call `pickRing(pass)` immediately after the per-source galaxy
  // draws, reusing the caller's @group(0) (CameraUniforms) binding.
  let ringPickPipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let instanceBuffer: GPUBuffer | null = null;
  let fadeBuffer: GPUBuffer | null = null;
  let fadeBindGroup: GPUBindGroup | null = null;
  // Dummy zeroed FadeUniforms for the pick pipeline.  Same pattern as
  // galaxyPickRenderer.ts's dummy fade group: the pick fragment
  // doesn't read fade.opacity (the pick texture is integer + has no
  // observable alpha), but the pipeline layout still declares the
  // canonical fadeBgl at @group(1) so other passes' bound fade
  // groups remain layout-compatible across the encoder boundary.
  let pickDummyFadeBuffer: GPUBuffer | null = null;
  let pickDummyFadeBindGroup: GPUBindGroup | null = null;
  const sourceBuffers = byCategory<GPUBuffer | null>(null);
  let cameraBindGroup: GPUBindGroup | null = null;
  const sourceBindGroups = byCategory<GPUBindGroup | null>(null);
  // Scratch arrays for the per-frame fade.opacity write.  Same shape
  // as filamentRenderer's fadeScratchF32: a 16-byte staging buffer that
  // matches the fade uniform's footprint, with the opacity f32 at offset
  // 0 and the trailing 12 bytes held at zero.
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  if (device) {
    const cameraBgl = device.createBindGroupLayout({
      label: 'structure-marker-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
    const sourceBgl = device.createBindGroupLayout({
      label: 'structure-marker-source-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
    // @group(1) FadeUniforms slot — the structure-marker shaders DO NOT
    // reference this slot (alpha rides on the per-descriptor fields the
    // CPU bakes in produceMarkers), but we MUST list the canonical
    // shared fadeBgl in the layout at slot 1.
    //
    // Why: WebGPU's draw-time validator compares the pipeline layout's
    // BGL at each slot against the BindGroupLayout of whatever
    // BindGroup is currently bound at that slot on the encoder.  Other
    // hdr-target layers (filaments, etc.) bind their filaments-fade-bg at
    // @group(1) before our pass runs; the encoder still has that bind
    // group set when our SetPipeline fires.  A placeholder BGL that
    // didn't match the fadeBgl would trip "BindGroupLayout … does not
    // match layout … set at group index 1".  Listing fadeBgl here keeps
    // the pipeline layout-compatible with whatever the prior pass
    // bound.  We never create a BindGroup against it ourselves.
    const pipelineLayout = device.createPipelineLayout({
      label: 'structure-marker-pipeline-layout',
      bindGroupLayouts: [cameraBgl, fadeBgl, sourceBgl],
    });

    const haloVs = createShaderModuleWithDevLog(device, haloVsCode, 'structureMarker.halo.vs');
    const haloFs = createShaderModuleWithDevLog(device, haloFsCode, 'structureMarker.halo.fs');
    const ringVs = createShaderModuleWithDevLog(device, ringVsCode, 'structureMarker.ring.vs');
    const ringFs = createShaderModuleWithDevLog(device, ringFsCode, 'structureMarker.ring.fs');

    const vertexBuffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: MARKER_INSTANCE_BYTES,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x4' }, // positionAndRadius
          { shaderLocation: 1, offset: 16, format: 'float32x4' }, // haloColorAndAlpha
          { shaderLocation: 2, offset: 32, format: 'float32x4' }, // ringColorAndAlpha
        ],
      },
    ];

    haloPipeline = device.createRenderPipeline({
      label: 'structure-marker-halo-pipeline',
      layout: pipelineLayout,
      vertex: { module: haloVs, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: {
        module: haloFs,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Additive — halo is emissive glow, not occluding overlay.
            blend: ADDITIVE_BLEND,
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      // No depthStencil — markers are UI overlay.
    });

    ringPipeline = device.createRenderPipeline({
      label: 'structure-marker-ring-pipeline',
      layout: pipelineLayout,
      vertex: { module: ringVs, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: {
        module: ringFs,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied-alpha OVER — ring is an opaque indicator
            // edge, must occlude rather than accumulate.
            blend: PREMULTIPLIED_OVER_BLEND,
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    // ── Ring-pick pipeline ────────────────────────────────────────────
    //
    // Compiles a SEPARATE GPUShaderModule pair from the same vertex
    // source as the visible-ring pipeline + the ringPick fragment.
    // We deliberately do NOT reuse the visible-ring modules — sharing
    // a GPUShaderModule across pipelines silently breaks `layout:'auto'`
    // bind-group reuse (see feedback_webgpu_auto_layout_trap.md).  Our
    // layout is explicit so we'd survive that trap, but the convention
    // is one module per pipeline so any future contributor who adds an
    // `auto` pipeline doesn't accidentally inherit a poisoned module.
    //
    // The pipeline layout is the same shared `pipelineLayout` the
    // visible pipelines use ([cameraBgl, fadeBgl, sourceBgl]) — caller-
    // bound @group(0) flows in from the engine's pick pass, our dummy
    // fade group lands at @group(1), per-category SourceUniforms at
    // @group(2).
    //
    // Differences vs. the visible-ring pipeline:
    //   - Fragment target is `r32uint` (integer pick texture).
    //   - No blend descriptor — integer formats don't support blending.
    //   - depthStencil enabled with `depth24plus` + `less`+writeEnabled
    //     so a closer galaxy pick fragment (running just before us in
    //     the same pass) wins the pixel over an occluded structure ring.
    //     The depth attachment is the same texture the galaxy pick
    //     draws used; we are intentionally a second batch INSIDE the
    //     same pass, not a separate pass.
    const ringPickVs = createShaderModuleWithDevLog(
      device,
      ringPickVsCode,
      'structureMarker.pick.vs',
    );
    const ringPickFs = createShaderModuleWithDevLog(
      device,
      ringPickFsCode,
      'structureMarker.pick.fs',
    );
    ringPickPipeline = device.createRenderPipeline({
      label: 'structure-marker-ring-pick-pipeline',
      layout: pipelineLayout,
      vertex: { module: ringPickVs, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: {
        module: ringPickFs,
        entryPoint: 'fsRingPick',
        targets: [{ format: 'r32uint' }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: resolveDepthCompare('nearer', reversedZ),
      },
    });

    // 16-byte zeroed FadeUniforms buffer — the pick fragment ignores
    // fade.opacity, but the pipeline layout still lists fadeBgl at
    // @group(1) for symmetry with the visible pipelines, so we MUST
    // bind a layout-compatible group there.  Allocated GPUBufferUsage.
    // UNIFORM only (no COPY_DST): we never write to it, the default-
    // zero contents are what we want.
    const pickDummyFade = createDummyFadeBindGroup(device, fadeBgl, 'structure-marker-pick');
    pickDummyFadeBuffer = pickDummyFade.buffer;
    pickDummyFadeBindGroup = pickDummyFade.bindGroup;

    uniformBuffer = device.createBuffer({
      label: 'structure-marker-uniforms',
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    instanceBuffer = device.createBuffer({
      label: 'structure-marker-instances',
      size: capacity * MARKER_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    cameraBindGroup = device.createBindGroup({
      label: 'structure-marker-camera-bg',
      layout: cameraBgl,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // @group(1) FadeUniforms — 16-byte buffer.  Each frame the whole
    // 16-byte scratch is uploaded; only its first 4 bytes carry the
    // fade.opacity scalar, the trailing 12 are struct pad and stay zero.
    // Bind group lives forever; only the buffer contents change.
    fadeBuffer = device.createBuffer({
      label: 'structure-marker-fade-uniform',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    fadeBindGroup = device.createBindGroup({
      label: 'structure-marker-fade-bg',
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
    });

    // Per-category SourceUniforms — written once at construction.
    for (const cat of STRUCTURE_IDS) {
      const buf = device.createBuffer({
        label: `structure-marker-source-${cat}`,
        size: SOURCE_UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      // Write the 5-bit source code at offset 0; rest stays zero.
      const u32 = new Uint32Array(SOURCE_UNIFORM_BYTES / 4);
      u32[0] = STRUCTURE_ID_CODES[cat];
      device.queue.writeBuffer(buf, 0, u32);
      sourceBuffers[cat] = buf;
      sourceBindGroups[cat] = device.createBindGroup({
        label: `structure-marker-source-bg-${cat}`,
        layout: sourceBgl,
        entries: [{ binding: 0, resource: { buffer: buf } }],
      });
    }
  }

  /**
   * Ensure the CPU scratch + GPU vertex buffers can hold at least `n`
   * instances, doubling capacity until they do.  No-op when the current
   * capacity already fits, so the steady state (after the catalog lands)
   * pays nothing.  Reallocating the GPU buffer is safe here: setMarkers
   * runs at frame start before this frame's submit; render reads the
   * `instanceBuffer` closure variable freshly each call, so it always
   * binds the current buffer.  destroy() on the old buffer is safe after
   * the prior frame's submit — WebGPU keeps the backing memory alive
   * until in-flight GPU reads complete.  Growth happens at most a handful
   * of times ever (64 → 128 → … until it fits ~660) then never again.
   */
  function growTo(n: number): void {
    if (n <= capacity) return;
    while (capacity < n) capacity *= 2;
    instanceBuf = new Float32Array(capacity * MARKER_INSTANCE_FLOATS);
    if (device) {
      instanceBuffer?.destroy();
      instanceBuffer = device.createBuffer({
        label: 'structure-marker-instances',
        size: capacity * MARKER_INSTANCE_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  function setMarkers(descriptors: readonly StructureMarkerDescriptor[]): void {
    // Partition descriptors by category — preserves order within each
    // category and keeps the instance buffer cache-friendly.  A handful
    // of categories means a few passes over the input is fine.
    currentMarkerCount = 0;
    for (const c of STRUCTURE_IDS) bucketCounts[c] = 0;

    // Grow to fit the full descriptor set — no truncation.  See growTo
    // and the `capacity` docstring for why a cap here would be a
    // correctness bug (dropped categories + desynced pick index), not
    // just a visual budget knob.
    growTo(descriptors.length);

    // First pass: count per category to compute offsets.
    const count = descriptors.length;
    for (let i = 0; i < count; i++) {
      bucketCounts[descriptors[i]!.category]++;
    }
    // Prefix-sum the counts into per-category run offsets.
    let acc = 0;
    for (const c of STRUCTURE_IDS) {
      bucketOffsets[c] = acc;
      acc += bucketCounts[c];
    }

    // Second pass: pack into the instance buffer in category-ordered runs.
    const writeCursor: Record<StructureId, number> = { ...bucketOffsets };
    for (let i = 0; i < count; i++) {
      const d = descriptors[i]!;
      const slot = writeCursor[d.category];
      writeCursor[d.category]++;
      const base = slot * MARKER_INSTANCE_FLOATS;
      instanceBuf[base + 0] = d.worldPos[0];
      instanceBuf[base + 1] = d.worldPos[1];
      instanceBuf[base + 2] = d.worldPos[2];
      instanceBuf[base + 3] = d.radiusMpc;
      instanceBuf[base + 4] = d.haloColor[0];
      instanceBuf[base + 5] = d.haloColor[1];
      instanceBuf[base + 6] = d.haloColor[2];
      instanceBuf[base + 7] = d.haloColor[3];
      instanceBuf[base + 8] = d.ringColor[0];
      instanceBuf[base + 9] = d.ringColor[1];
      instanceBuf[base + 10] = d.ringColor[2];
      instanceBuf[base + 11] = d.ringColor[3];
      currentMarkerCount++;
    }

    if (!device || !instanceBuffer || currentMarkerCount === 0) return;
    device.queue.writeBuffer(
      instanceBuffer,
      0,
      instanceBuf,
      0,
      currentMarkerCount * MARKER_INSTANCE_FLOATS,
    );
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    fadeOpacity: number,
  ): void {
    if (
      !device ||
      !haloPipeline ||
      !ringPipeline ||
      !uniformBuffer ||
      !instanceBuffer ||
      !cameraBindGroup ||
      !fadeBuffer ||
      !fadeBindGroup
    )
      return;
    if (currentMarkerCount === 0) return;

    // Write the 80-byte CameraUniforms prefix.  Same shape as markerLineRenderer.
    // The two reserved pads (floats 18..19) stay zero via Float32Array zero-init.
    const uni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportSize);
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    // Per-frame fade.opacity write — same pattern as filamentRenderer.
    // The upload spans the full 16-byte scratch (one writeBuffer of a
    // whole struct, not a partial write): opacity occupies floats [0],
    // the trailing 12 bytes are pad and stay zero from the zero-init.
    fadeScratchF32[0] = fadeOpacity;
    device.queue.writeBuffer(fadeBuffer, 0, fadeScratchBuffer);

    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, fadeBindGroup);

    // Halo passes first (additive) — voids skip; see spec §2.1.  We
    // could check bucket-level halo presence by inspecting each
    // descriptor's haloAlpha, but issuing the draw with haloAlpha == 0
    // on every instance is cheap and the per-fragment math is
    // multiplied by 0 → no observable contribution.  For voids the
    // descriptor sets haloAlpha = 0 (set by produceMarkers), so the
    // draw is a no-op visually.  Keep the per-category dispatch
    // explicit anyway — the pick path branches on category.
    //
    // Per-category instance_index: rather than draw with
    // firstInstance=bucketOffset (which would make the GPU's
    // @builtin(instance_index) a GLOBAL slot across all categories),
    // slide setVertexBuffer's byte-offset to the bucket start and
    // draw with firstInstance=0.  That way instance_index runs 0..count-1
    // per category — the index the CPU-side pick resolver expects when
    // it does `categoryStructures[structureIndex]`.  Functionally identical for
    // the visible draws (their shaders don't read instance_index for
    // visual output); load-bearing for the pick path.
    pass.setPipeline(haloPipeline);
    for (const cat of STRUCTURE_IDS) {
      if (cat === 'void') continue; // explicit skip per spec
      if (bucketCounts[cat] === 0) continue;
      const bg = sourceBindGroups[cat];
      if (!bg) continue;
      pass.setBindGroup(2, bg);
      pass.setVertexBuffer(0, instanceBuffer, bucketOffsets[cat] * MARKER_INSTANCE_BYTES);
      pass.draw(6, bucketCounts[cat], 0, 0);
    }

    // Ring passes second (premultiplied OVER — composites over halo).
    pass.setPipeline(ringPipeline);
    for (const cat of STRUCTURE_IDS) {
      if (bucketCounts[cat] === 0) continue;
      const bg = sourceBindGroups[cat];
      if (!bg) continue;
      pass.setBindGroup(2, bg);
      pass.setVertexBuffer(0, instanceBuffer, bucketOffsets[cat] * MARKER_INSTANCE_BYTES);
      pass.draw(6, bucketCounts[cat], 0, 0);
    }
  }

  function markerCount(): number {
    return currentMarkerCount;
  }

  /**
   * Issue per-category structure ring pick draws into the caller-supplied
   * render pass.  See the docstring on StructureMarkerRenderer.pickRing
   * for the binding contract — short version: caller bound @group(0),
   * we bind @group(1) (dummy fade) + @group(2) (per-category source)
   * and emit one `draw(6, count)` per non-empty bucket.
   *
   * We reuse the same per-category bucketing the visible draw path
   * already produced in `setMarkers` (bucketOffsets + bucketCounts +
   * sourceBindGroups + instanceBuffer).  The instanceBuffer's per-
   * instance layout matches what ring.wesl's vertex stage expects —
   * which is the same source the pick pipeline's vertex stage compiles
   * from — so no separate vertex data is needed.
   *
   * Voids ARE included in the pick path (unlike the halo draw, which
   * skips them) — a user should still be able to click a void's ring.
   */
  function pickRing(passEncoder: GPURenderPassEncoder): void {
    if (!device || !ringPickPipeline || !instanceBuffer || !pickDummyFadeBindGroup) return;
    if (currentMarkerCount === 0) return;
    passEncoder.setPipeline(ringPickPipeline);
    passEncoder.setBindGroup(1, pickDummyFadeBindGroup);
    for (const cat of STRUCTURE_IDS) {
      if (bucketCounts[cat] === 0) continue;
      const bg = sourceBindGroups[cat];
      if (!bg) continue;
      passEncoder.setBindGroup(2, bg);
      // Per-category instance_index via vertex-buffer offset (NOT
      // firstInstance).  See the visible-draw block above for the
      // rationale — keeps structureIndex 0..count-1 per category so the
      // CPU-side resolver can do `categoryStructures[structureIndex]` directly.
      passEncoder.setVertexBuffer(0, instanceBuffer, bucketOffsets[cat] * MARKER_INSTANCE_BYTES);
      passEncoder.draw(6, bucketCounts[cat], 0, 0);
    }
  }

  function destroy(): void {
    uniformBuffer?.destroy();
    instanceBuffer?.destroy();
    fadeBuffer?.destroy();
    pickDummyFadeBuffer?.destroy();
    for (const cat of STRUCTURE_IDS) {
      sourceBuffers[cat]?.destroy();
    }
  }

  const renderer: StructureMarkerRenderer = {
    label: 'structureMarkerRenderer',
    setMarkers,
    draw,
    markerCount,
    pickRing,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
