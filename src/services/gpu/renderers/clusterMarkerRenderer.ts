/**
 * clusterMarkerRenderer — instanced halo + ring overlay for cluster /
 * supercluster / void POIs.
 *
 * ### Why one renderer for two pipelines?
 *
 * Halos and rings share the same per-POI instance data (position,
 * radius, tints, alphas) and the same camera uniform; only the
 * fragment math differs (additive radial gradient vs. screen-AA ring).
 * One renderer that owns both pipelines + one shared instance vertex
 * buffer lets `setMarkers` upload once per frame and dispatch two
 * draws — versus two factory call sites maintaining two parallel
 * instance buffers.
 *
 * ### Why one draw per category (cluster / supercluster / void)?
 *
 * The marker renderer pre-architects for plan 3's pick fragment.
 * Plan 3 will add a `ringPick.wesl` whose fragment composes
 * `(source.sourceCode << 27) | poiIndex + PICK_SENTINEL_OFFSET` from
 * a per-source uniform — identical to `pointRenderer`'s per-survey
 * uniform pattern.  Issuing one draw per category here (with the
 * per-category SourceUniforms bound at `@group(2)`) means plan 3
 * adds the pick pipeline without re-shaping how descriptors are
 * batched.
 *
 * Voids skip the halo draw entirely (per the spec — a halo would
 * imply matter where the structure is defined by absence).  The
 * descriptor's `haloAlpha === 0` is the gate; descriptors flow into
 * the partition but the halo draw for the void bucket is skipped.
 *
 * ### CPU-only mode
 *
 * Constructed with a null device for unit tests.  GPU resource
 * allocation is guarded by `if (device)` so `setMarkers` packs the
 * CPU scratch buffer + bumps the counter without touching the GPU.
 * Mirrors `markerLineRenderer.ts`'s null-device pattern.
 *
 * ### Pipeline shape (Task 7)
 *
 * Two pipelines built from one module each (never share GPUShaderModule
 * across pipelines — WebGPU layout: 'auto' bites otherwise; see the
 * MEMORY note `feedback_webgpu_auto_layout_trap.md`):
 *
 *   - Halo:  additive blend (one, one), vertex 'vs' + fragment 'fs'
 *            from halo.wesl
 *   - Ring:  premultiplied-OVER blend, vertex 'vs' + fragment 'fs'
 *            from ring.wesl
 *
 * Both pipelines share an EXPLICIT pipeline layout — not 'auto' —
 * built from one CameraUniforms BGL (`@group(0)`) and one
 * SourceUniforms BGL (`@group(2)`).  An explicit shared layout means
 * one `device.createBindGroup(...)` is valid against both pipelines
 * (which `layout: 'auto'` does NOT guarantee).
 *
 * ### Per-category source uniforms (pre-architects pick path)
 *
 * Three pre-built SourceUniforms buffers (one each for cluster=5,
 * supercluster=6, void=7).  The `render` method partitions descriptors
 * by category, binds the matching SourceUniforms, and issues one
 * instanced draw per non-empty bucket.  Plan 3's pick pipeline will
 * reuse this same per-category dispatch — its ringPick fragment reads
 * `source.sourceCode` to compose `(sourceCode << 27) | poiIndex + 1`.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { ClusterMarkerRenderer } from '../../../@types/rendering/ClusterMarkerRenderer';
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import { STRUCTURE_CATEGORIES, SOURCE_CODE_BY_CATEGORY } from '../../../data/structureCategories';
import haloVsCode from '../shaders/clusterMarker/halo.wesl?static';
import haloFsCode from '../shaders/clusterMarker/halo.wesl?static';
import ringVsCode from '../shaders/clusterMarker/ring.wesl?static';
import ringFsCode from '../shaders/clusterMarker/ring.wesl?static';
import ringPickVsCode from '../shaders/clusterMarker/ring.wesl?static';
import ringPickFsCode from '../shaders/clusterMarker/ringPick.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/**
 * 12 floats per instance × 4 bytes = 48 bytes/instance.
 *
 * Layout (matches VsIn in clusterMarker/io.wesl):
 *   [0..2]   position.xyz       — world-space centre
 *   [3]      radiusMpc          — world-space half-extent (ring + halo)
 *   [4..7]   haloColor.rgba     — additive halo tint + final alpha
 *   [8..11]  ringColor.rgba     — ring tint + final alpha
 *
 * Halo and ring carry independent RGB tints so voids — which opt out
 * of the additive halo entirely (haloAlpha = 0) — can still display
 * their cyan ring without falling back to halo's (0, 0, 0).  v1
 * shared halo's RGB across both pipelines as a stride-saving
 * approximation; the void colour mismatch forced the split.
 */
const MARKER_INSTANCE_FLOATS = 12;
const MARKER_INSTANCE_BYTES = MARKER_INSTANCE_FLOATS * 4;

/** Shared CameraUniforms prefix size — same 80 bytes as markerLineRenderer. */
const UNIFORM_BYTES = 80;

/** SourceUniforms = u32 sourceCode + 12 bytes pad = 16 bytes. */
const SOURCE_UNIFORM_BYTES = 16;

export function createClusterMarkerRenderer(
  ctx: GpuContext,
  /**
   * The colour-attachment format the halo + ring pipelines write into.
   * This renderer is part of `HDR_PASSES`, so the format is the offscreen
   * HDR target (`rgba16float`) — NOT `ctx.format`, which is the canvas
   * swap-chain (`bgra8unorm`).  Halos accumulate additively into the same
   * float buffer the points / quads / disks / filaments write, then the
   * tone-map pass compresses everything onto the swap chain.  Passing
   * `ctx.format` here would trip a WebGPU validation error at draw time
   * (`attachment state … is not compatible with [RenderPassEncoder]`).
   * Mirrors the `hdrFormat` parameter on `createFilamentRenderer`.
   */
  hdrFormat: GPUTextureFormat,
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
  initialCapacity = 64,
): ClusterMarkerRenderer {
  const device = ctx.device as GPUDevice | null;
  const format = hdrFormat;

  // Per-instance capacity.  This is an INITIAL hint, not a hard cap:
  // `setMarkers` grows both the CPU scratch buffer and the GPU vertex
  // buffer (see growTo) to fit whatever descriptor count it's handed.
  //
  // Why grow rather than cap: produceMarkers emits one descriptor per
  // marker-bearing POI of a visible category EVERY frame — including
  // fully-faded ones (the emit-all-then-discard contract that keeps the
  // ring-pick instance_index aligned with getPoisForCategory).  So the
  // count is data-driven (~660 with the M500 ≥ 1.0 cluster cut, more if
  // the catalog grows).  A fixed cap silently truncated the tail in
  // `pois` order, which both dropped whole categories off-screen
  // (clusters saturated the buffer, so superclusters and voids never got
  // packed — visible only when clusters were toggled off) AND desynced
  // the per-category pick index.  Growing keeps the renderer correct for
  // any catalog size; the buffer is tiny (660 × 48 B ≈ 31 KB).
  let capacity = initialCapacity;
  let instanceBuf = new Float32Array(capacity * MARKER_INSTANCE_FLOATS);
  let currentMarkerCount = 0;

  // Per-category bucket bookkeeping: where each category's run begins
  // in the instance buffer + how many descriptors it owns.  Reset at
  // the start of every setMarkers call.
  const bucketOffsets: Record<'cluster' | 'supercluster' | 'void' | 'group', number> = {
    cluster: 0,
    supercluster: 0,
    void: 0,
    group: 0,
  };
  const bucketCounts: Record<'cluster' | 'supercluster' | 'void' | 'group', number> = {
    cluster: 0,
    supercluster: 0,
    void: 0,
    group: 0,
  };

  // GPU resources — null when device is null.
  let haloPipeline: GPURenderPipeline | null = null;
  let ringPipeline: GPURenderPipeline | null = null;
  // Ring-pick pipeline — same vertex source as ringPipeline, fragment
  // swapped to ringPick.wesl's fsRingPick + colour target swapped to
  // r32uint + depth24plus added.  See the pick pipeline build below for
  // the full rationale; in short, this is the POI sibling of the
  // galaxy pick path in pickRenderer.ts.  The engine's pick pass will
  // call `pickRing(pass)` immediately after the per-source galaxy
  // draws, reusing the caller's @group(0) (CameraUniforms) binding.
  let ringPickPipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let instanceBuffer: GPUBuffer | null = null;
  let fadeBuffer: GPUBuffer | null = null;
  let fadeBindGroup: GPUBindGroup | null = null;
  // Dummy zeroed FadeUniforms for the pick pipeline.  Pattern lifted
  // verbatim from pickRenderer.ts lines 197-206: the pick fragment
  // doesn't read fade.opacity (the pick texture is integer + has no
  // observable alpha), but the pipeline layout still declares the
  // canonical fadeBgl at @group(1) so other passes' bound fade
  // groups remain layout-compatible across the encoder boundary.
  let pickDummyFadeBuffer: GPUBuffer | null = null;
  let pickDummyFadeBindGroup: GPUBindGroup | null = null;
  const sourceBuffers: Record<'cluster' | 'supercluster' | 'void' | 'group', GPUBuffer | null> = {
    cluster: null,
    supercluster: null,
    void: null,
    group: null,
  };
  let cameraBindGroup: GPUBindGroup | null = null;
  const sourceBindGroups: Record<
    'cluster' | 'supercluster' | 'void' | 'group',
    GPUBindGroup | null
  > = {
    cluster: null,
    supercluster: null,
    void: null,
    group: null,
  };
  // Scratch arrays for the per-frame fade.opacity write.  Same shape
  // as filamentRenderer's fadeScratchF32: a single f32 sliced into the
  // 16-byte fade uniform buffer at offset 0.
  const fadeScratchBuffer = new ArrayBuffer(4);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  if (device) {
    const cameraBgl = device.createBindGroupLayout({
      label: 'cluster-marker-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
    const sourceBgl = device.createBindGroupLayout({
      label: 'cluster-marker-source-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
    // @group(1) FadeUniforms slot — the cluster-marker shaders DO NOT
    // reference this slot (alpha rides on the per-descriptor fields the
    // CPU bakes in produceMarkers), but we MUST list the canonical
    // shared fadeBgl in the layout at slot 1.
    //
    // Why: WebGPU's draw-time validator compares the pipeline layout's
    // BGL at each slot against the BindGroupLayout of whatever
    // BindGroup is currently bound at that slot on the encoder.  Other
    // HDR_PASSES (filaments, etc.) bind their filaments-fade-bg at
    // @group(1) before our pass runs; the encoder still has that bind
    // group set when our SetPipeline fires.  A placeholder BGL that
    // didn't match the fadeBgl would trip "BindGroupLayout … does not
    // match layout … set at group index 1".  Listing fadeBgl here keeps
    // the pipeline layout-compatible with whatever the prior pass
    // bound.  We never create a BindGroup against it ourselves.
    const pipelineLayout = device.createPipelineLayout({
      label: 'cluster-marker-pipeline-layout',
      bindGroupLayouts: [cameraBgl, fadeBgl, sourceBgl],
    });

    const haloVs = createShaderModuleWithDevLog(device, haloVsCode, 'clusterMarker.halo.vs');
    const haloFs = createShaderModuleWithDevLog(device, haloFsCode, 'clusterMarker.halo.fs');
    const ringVs = createShaderModuleWithDevLog(device, ringVsCode, 'clusterMarker.ring.vs');
    const ringFs = createShaderModuleWithDevLog(device, ringFsCode, 'clusterMarker.ring.fs');

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
      label: 'cluster-marker-halo-pipeline',
      layout: pipelineLayout,
      vertex: { module: haloVs, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: {
        module: haloFs,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Additive — halo is emissive glow, not occluding overlay.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      // No depthStencil — markers are UI overlay.
    });

    ringPipeline = device.createRenderPipeline({
      label: 'cluster-marker-ring-pipeline',
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
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    // ── Ring-pick pipeline (plan 3 task 2) ────────────────────────────
    //
    // Compiles a SEPARATE GPUShaderModule pair from the same vertex
    // source as the visible-ring pipeline + the new ringPick fragment.
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
    //     the same pass) wins the pixel over an occluded POI ring.
    //     The depth attachment is the same texture the galaxy pick
    //     draws used; we are intentionally a second batch INSIDE the
    //     same pass, not a separate pass.
    const ringPickVs = createShaderModuleWithDevLog(
      device,
      ringPickVsCode,
      'clusterMarker.pick.vs',
    );
    const ringPickFs = createShaderModuleWithDevLog(
      device,
      ringPickFsCode,
      'clusterMarker.pick.fs',
    );
    ringPickPipeline = device.createRenderPipeline({
      label: 'cluster-marker-ring-pick-pipeline',
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
        depthCompare: 'less',
      },
    });

    // 16-byte zeroed FadeUniforms buffer — the pick fragment ignores
    // fade.opacity, but the pipeline layout still lists fadeBgl at
    // @group(1) for symmetry with the visible pipelines, so we MUST
    // bind a layout-compatible group there.  Allocated GPUBufferUsage.
    // UNIFORM only (no COPY_DST): we never write to it, the default-
    // zero contents are what we want.
    pickDummyFadeBuffer = device.createBuffer({
      label: 'cluster-marker-pick-fade-dummy',
      size: 16,
      usage: GPUBufferUsage.UNIFORM,
    });
    pickDummyFadeBindGroup = device.createBindGroup({
      label: 'cluster-marker-pick-fade-bg-dummy',
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: pickDummyFadeBuffer } }],
    });

    uniformBuffer = device.createBuffer({
      label: 'cluster-marker-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    instanceBuffer = device.createBuffer({
      label: 'cluster-marker-instances',
      size: capacity * MARKER_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    cameraBindGroup = device.createBindGroup({
      label: 'cluster-marker-camera-bg',
      layout: cameraBgl,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // @group(1) FadeUniforms — 16-byte buffer; we write the per-frame
    // fade.opacity scalar into the first 4 bytes each frame.  Bind
    // group lives forever; only the buffer contents change.
    fadeBuffer = device.createBuffer({
      label: 'cluster-marker-fade-uniform',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    fadeBindGroup = device.createBindGroup({
      label: 'cluster-marker-fade-bg',
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
    });

    // Per-category SourceUniforms — written once at construction.
    for (const cat of STRUCTURE_CATEGORIES) {
      const buf = device.createBuffer({
        label: `cluster-marker-source-${cat}`,
        size: SOURCE_UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      // Write the 5-bit source code at offset 0; rest stays zero.
      const u32 = new Uint32Array(SOURCE_UNIFORM_BYTES / 4);
      u32[0] = SOURCE_CODE_BY_CATEGORY[cat];
      device.queue.writeBuffer(buf, 0, u32);
      sourceBuffers[cat] = buf;
      sourceBindGroups[cat] = device.createBindGroup({
        label: `cluster-marker-source-bg-${cat}`,
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
        label: 'cluster-marker-instances',
        size: capacity * MARKER_INSTANCE_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  function setMarkers(descriptors: readonly ClusterMarkerDescriptor[]): void {
    // Partition descriptors by category — preserves order within each
    // category and keeps the instance buffer cache-friendly.  Three
    // categories means three passes over the input is fine.
    currentMarkerCount = 0;
    bucketCounts.cluster = 0;
    bucketCounts.supercluster = 0;
    bucketCounts.void = 0;
    bucketCounts.group = 0;

    // Grow to fit the full descriptor set — no truncation.  See growTo
    // and the `capacity` docstring for why a cap here was a correctness
    // bug (dropped categories + desynced pick index), not just a visual
    // budget knob.
    growTo(descriptors.length);

    // First pass: count per category to compute offsets.
    const count = descriptors.length;
    for (let i = 0; i < count; i++) {
      const d = descriptors[i]!;
      if (d.category === 'cluster') bucketCounts.cluster++;
      else if (d.category === 'supercluster') bucketCounts.supercluster++;
      else if (d.category === 'void') bucketCounts.void++;
      else if (d.category === 'group') bucketCounts.group++;
      // famousGalaxy and any future label-only category have no markers; skip.
    }
    bucketOffsets.cluster = 0;
    bucketOffsets.supercluster = bucketOffsets.cluster + bucketCounts.cluster;
    bucketOffsets.void = bucketOffsets.supercluster + bucketCounts.supercluster;
    bucketOffsets.group = bucketOffsets.void + bucketCounts.void;

    // Second pass: pack into the instance buffer in category-ordered runs.
    const writeCursor: Record<'cluster' | 'supercluster' | 'void' | 'group', number> = {
      cluster: bucketOffsets.cluster,
      supercluster: bucketOffsets.supercluster,
      void: bucketOffsets.void,
      group: bucketOffsets.group,
    };
    for (let i = 0; i < count; i++) {
      const d = descriptors[i]!;
      if (
        d.category !== 'cluster' &&
        d.category !== 'supercluster' &&
        d.category !== 'void' &&
        d.category !== 'group'
      )
        continue;
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

  function render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
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
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj, 0);
    uni[16] = viewportSize[0];
    uni[17] = viewportSize[1];
    // uni[18], uni[19] stay zero (the two reserved pads).
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    // Per-frame fade.opacity write — same pattern as filamentRenderer.
    // Only the first 4 bytes carry data; the trailing 12 bytes of the
    // 16-byte uniform are pad and stay zero.
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
    // explicit anyway — plan 3 branches on category for pick.
    //
    // Per-category instance_index: rather than draw with
    // firstInstance=bucketOffset (which would make the GPU's
    // @builtin(instance_index) a GLOBAL slot across all categories),
    // slide setVertexBuffer's byte-offset to the bucket start and
    // draw with firstInstance=0.  That way instance_index runs 0..count-1
    // per category — the index the CPU-side pick resolver expects when
    // it does `categoryPois[poiIndex]`.  Functionally identical for
    // the visible draws (their shaders don't read instance_index for
    // visual output); load-bearing for the pick path.
    pass.setPipeline(haloPipeline);
    for (const cat of STRUCTURE_CATEGORIES) {
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
    for (const cat of STRUCTURE_CATEGORIES) {
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
   * Issue per-category POI ring pick draws into the caller-supplied
   * render pass.  See the docstring on ClusterMarkerRenderer.pickRing
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
    for (const cat of STRUCTURE_CATEGORIES) {
      if (bucketCounts[cat] === 0) continue;
      const bg = sourceBindGroups[cat];
      if (!bg) continue;
      passEncoder.setBindGroup(2, bg);
      // Per-category instance_index via vertex-buffer offset (NOT
      // firstInstance).  See the visible-draw block above for the
      // rationale — keeps poiIndex 0..count-1 per category so the
      // CPU-side resolver can do `categoryPois[poiIndex]` directly.
      passEncoder.setVertexBuffer(0, instanceBuffer, bucketOffsets[cat] * MARKER_INSTANCE_BYTES);
      passEncoder.draw(6, bucketCounts[cat], 0, 0);
    }
  }

  function destroy(): void {
    uniformBuffer?.destroy();
    instanceBuffer?.destroy();
    fadeBuffer?.destroy();
    pickDummyFadeBuffer?.destroy();
    for (const cat of STRUCTURE_CATEGORIES) {
      sourceBuffers[cat]?.destroy();
    }
  }

  const renderer: ClusterMarkerRenderer = {
    label: 'clusterMarkerRenderer',
    setMarkers,
    render,
    markerCount,
    pickRing,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
