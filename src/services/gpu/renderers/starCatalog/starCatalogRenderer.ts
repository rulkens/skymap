/**
 * starCatalogRenderer — the survey (Gaia bin) stars as additive point sprites
 * in the depthless HDR accumulation, fed from an in-file octree of
 * cell-quantized 6-byte records.
 *
 * ### Why a dedicated pipeline (not `starPointRenderer`, not `galaxyPointRenderer`)
 *
 * `starPointRenderer` draws a flat instance buffer of a handful of seeded
 * scene stars; it has no notion of an octree, a per-node origin, or a
 * vertex-pulled record. `galaxyPointRenderer` bakes a `GalaxyCatalog` into a
 * 52-byte interleaved instance layout through an off-thread worker and
 * threads three engine bind-group layouts. The survey stars are a third
 * shape: their positions live as 10-bit in-cell offsets inside 6-byte
 * records, reconstructed against a per-node box origin the CPU rebases into
 * the camera-relative frame each frame. So this is its own thin pipeline
 * that shares the actual common substance at the WESL level (`lib/camera` +
 * `lib/billboard`, the Gaussian dot) rather than at the pipeline level.
 *
 * ### Storage vs frame — the two lifecycles (mirrors `catalogStore`)
 *
 * A catalog's record blob is a static per-source resource: uploaded once,
 * kept for the session (`upload`). The per-frame octree cut is the changing
 * part — `walkStarOctreeCut` (in the layer) picks which nodes to draw, and
 * `draw` renders that cut. `loadedCatalogs()` exposes every committed catalog
 * so the layer can walk each octree per frame. Keeping the two apart is the
 * same seam `catalogStore` draws for the galaxy points.
 *
 * ### One instanced draw per source, via a prefix-sum instance router
 *
 * Every drawn node needs three things NOT in the record: its box origin
 * (camera-relative), its box scale, and its record-slice base. Those go in a
 * `NodeParams` struct — but instead of one dynamic-offset uniform block per
 * node bound with a separate draw, the whole cut is drawn in ONE
 * `draw(3, totalInstances)`. Two per-source read-only storage buffers make
 * that possible, both written ONCE per frame:
 *
 *   - `nodeParams`: `array<NodeParams>`, the cut's per-draw params packed
 *     CONTIGUOUSLY (32 B each, index = draw slot — std430 stride equals the
 *     std140 size here, so the packing is the same bytes the dynamic-offset
 *     path used, just tightly packed instead of 256-strided).
 *   - `prefix`: `array<u32>`, each draw slot's EXCLUSIVE starting global
 *     instance index (the prefix sum of the per-draw record counts).
 *
 * The vertex stage binary-searches `prefix` by `@builtin(instance_index)` to
 * find its owning draw slot `s`, then reads `nodeParams[s]` and record index
 * `firstRecord + (instance - prefix[s])`. So 40k `setBindGroup + draw` pairs
 * collapse to three `setBindGroup`s and one `draw` — the CPU no longer touches
 * the pass per node.
 *
 * The two storage buffers are PER SOURCE, and this is the same WebGPU
 * writeBuffer/submit landmine as before (CLAUDE.md): all `queue.writeBuffer`
 * calls execute before the frame's single `submit`, so a buffer SHARED across
 * sources and written per source would, at draw time, read only the LAST
 * source's data for every source's draw. Distinct per-source buffers each
 * retain their own bytes. (The camera uniform IS shared across sources — its
 * bytes are identical every source in a frame, so the repeated write is
 * idempotent.) The bind group over the two storage buffers is rebuilt each
 * frame with the exact bound SIZE (`count` elements), so the shader's
 * `arrayLength(&prefix)` yields the live draw count — no separate count uniform.
 *
 * ### Two streams — leaf into HDR, aggregate into a half-res offscreen
 *
 * The octree cut splits into a LEAF stream (childless real-star nodes) and an
 * AGGREGATE stream (interior flux-mip glows). Aggregate glow FILL is the star
 * pass's dominant GPU cost, so the two streams draw into different targets: the
 * leaf stream into the full-res HDR accumulation (fragment `fs`, per-glow knee),
 * the aggregate stream LINEAR into the half-res `star-aggregates` offscreen
 * (fragment `fsLinear`), which the `star-upsample` composite then knees and adds
 * back. Both targets are `rgba16float`, so ONE `targetFormat` builds BOTH
 * pipelines — they differ only in fragment entry point. The two per-source
 * storage-buffer pairs multiply per stream (aggregate + leaf), and for the SAME
 * writeBuffer/submit reason: the aggregate draw (into the offscreen pass) and
 * the leaf draw (into the HDR pass) are encoded in the same frame, so a shared
 * pair would read only the last-written stream's bytes. Each stream owns its
 * pair, written once before its draw. `stream` on the draw args picks the
 * pipeline + the pair.
 *
 * ### Record repack at upload — 6 bytes → two u32
 *
 * The on-disk record is a 48-bit field stored as two independent 24-bit
 * halves (`lo`, `hi`) — packStarRecord splits it that way because JS bitwise
 * ops are signed-32 (see starCatalogFormat.ts). A raw 6-byte blob is not
 * 4-byte-aligned per record, so `upload` repacks each record into two u32
 * (`lo`, `hi`) — a `array<u32>` the vertex stage indexes as
 * `records[base*2]` / `records[base*2+1]` and unpacks bit-for-bit. The 8/6
 * VRAM overhead buys clean aligned addressing.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type {
  StarCatalogRenderer,
  StarCatalogDrawArgs,
  StarCatalogPickResources,
  StarDrawStream,
} from '../../../../@types/rendering/StarCatalogRenderer';
import type { SourceType } from '../../../../@types/data/SourceType';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import { RECORD_BYTES } from '../../../../data/starCatalog/starCatalogFormat';
import vsCode from '../../shaders/starCatalog/vertex.wesl?static';
import fsCode from '../../shaders/starCatalog/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { sphereOutsideFrustum } from '../../../../utils/camera/sphereOutsideFrustum';
import { DEFAULT_STAR_SIZE_PX } from '../../../../data/defaults';
// The NodeParams / StarUniforms byte layout lives in ONE home both star
// renderers import — see starCatalogLayout.ts (the WESL structs in
// shaders/starCatalog/io.wesl are the source of truth). This renderer never
// writes `pickPass` (u32 index 23): its per-source camera write stops at
// `glowOverlap`, and the scratch is zero-init, so the vertex stage reads
// pickPass == 0 and takes the visual path; only `starCatalogPickRenderer` writes
// it = 1.
import {
  NODE_PARAMS_BYTES,
  PREFIX_BYTES,
  STAR_UNIFORM_BYTES,
  SIZE_PX_FLOAT_INDEX,
  BRIGHTNESS_FLOAT_INDEX,
  GLOW_OVERLAP_FLOAT_INDEX,
  AGG_INTENSITY_CAP_FLOAT_INDEX,
  writeStarNodeParams,
} from './starCatalogLayout';

/**
 * One draw stream's per-source storage buffers: the contiguous NodeParams block
 * and the parallel prefix sum, plus their shared grow-only capacity. A stream
 * (leaf or aggregate) owns its OWN pair — the two streams draw into different
 * passes in the same frame, so a shared pair would read only the last-written
 * stream's bytes at submit (the writeBuffer/submit landmine).
 */
type StreamBuffers = {
  /**
   * Per-source `array<NodeParams>` storage buffer, grown as this stream's draw
   * count grows. Written once per frame (in this stream's `draw`).
   */
  nodeParamsBuffer: GPUBuffer | null;
  /** Per-source `array<u32>` prefix-sum storage buffer, grown alongside. */
  prefixBuffer: GPUBuffer | null;
  /** Capacity of the pair in draw slots (grow-only). */
  drawCapacity: number;
};

function emptyStreamBuffers(): StreamBuffers {
  return { nodeParamsBuffer: null, prefixBuffer: null, drawCapacity: 0 };
}

/** One committed catalog's GPU resources + the octree kept for the layer. */
type LoadedStarSource = {
  catalog: StarCatalog;
  /** The repacked record blob (`array<u32>`, two u32 per record). */
  recordsBuffer: GPUBuffer;
  /** `@group(2)` bind group over `recordsBuffer`, built at upload. */
  recordsBindGroup: GPUBindGroup;
  /** The two draw streams' per-source buffer pairs (see `StreamBuffers`). */
  streams: Record<StarDrawStream, StreamBuffers>;
};

export function createStarCatalogRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StarCatalogRenderer {
  // ── Camera uniform (shared across sources — see the module header) ────────
  // Sized to STAR_UNIFORM_BYTES: the 80-byte CameraUniforms prefix plus the
  // source-independent `sizePx` + `brightness` + `glowOverlap` scalars, matching
  // `struct StarUniforms`.
  const cameraBuffer = device.createBuffer({
    label: 'star-catalog-camera-uniform',
    size: STAR_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const cameraScratch = new Float32Array(STAR_UNIFORM_BYTES / 4);

  // ── Bind-group layouts (explicit, not 'auto' — layouts don't cross pipelines) ─
  const cameraBgl = device.createBindGroupLayout({
    label: 'star-catalog-camera-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const drawBgl = device.createBindGroupLayout({
    label: 'star-catalog-draw-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        // The cut's per-draw NodeParams, packed contiguously. Read-only storage
        // so it is vertex-stage readable and can hold the whole cut (tens of
        // thousands of draws), which a uniform's 64 KB cap could not.
        buffer: { type: 'read-only-storage', minBindingSize: NODE_PARAMS_BYTES },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        // The per-draw exclusive prefix sum; `arrayLength(&prefix)` = draw count.
        buffer: { type: 'read-only-storage', minBindingSize: PREFIX_BYTES },
      },
    ],
  });
  const recordsBgl = device.createBindGroupLayout({
    label: 'star-catalog-records-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        // 'read-only-storage': the shader declares `var<storage, read>`.
        buffer: { type: 'read-only-storage' },
      },
    ],
  });

  const cameraBindGroup = device.createBindGroup({
    label: 'star-catalog-camera-bg',
    layout: cameraBgl,
    entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
  });

  // ── Shader modules + pipeline (additive, depthless — the hdr row has no depth) ─
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'starCatalog.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'starCatalog.fragment');

  // Both streams share the vertex stage + the three bind-group layouts, and
  // both targets (HDR + the star-aggregates offscreen) are rgba16float, so one
  // pipeline layout + one `targetFormat` builds both. They differ ONLY in the
  // fragment entry point: `fs` (leaf) applies the per-glow knee, `fsLinear`
  // (aggregate) writes the linear glow + raw scalar for the composite to knee.
  const pipelineLayout = device.createPipelineLayout({
    label: 'star-catalog-pipeline-layout',
    bindGroupLayouts: [cameraBgl, drawBgl, recordsBgl],
  });
  function makePipeline(label: string, entryPoint: 'fs' | 'fsLinear'): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: pipelineLayout,
      vertex: { module: vsModule, entryPoint: 'vs' }, // records vertex-pulled, no vertex buffers
      fragment: {
        module: fsModule,
        entryPoint,
        // One/one additive on premultiplied output — overlapping stars brighten.
        targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
      },
      // Three vertices per instanced circumscribing-triangle billboard.
      primitive: { topology: 'triangle-list' },
      // NO depthStencil: neither the hdr nor the star-aggregates target has depth.
    });
  }
  const pipelines: Record<StarDrawStream, GPURenderPipeline> = {
    leaf: makePipeline('star-catalog-leaf-pipeline', 'fs'),
    aggregate: makePipeline('star-catalog-aggregate-pipeline', 'fsLinear'),
  };

  // ── Per-source store ──────────────────────────────────────────────────────
  const sources = new Map<SourceType, LoadedStarSource>();

  /**
   * Repack the catalog's 6-byte records into a `array<u32>` (two u32 per
   * record, `lo` = on-disk bytes 0..2, `hi` = bytes 3..5) — the layout the
   * vertex stage unpacks. Mirrors packStarRecord's little-endian byte order.
   */
  function repackRecords(records: Uint8Array): Uint32Array {
    const total = records.length / RECORD_BYTES;
    const out = new Uint32Array(total * 2);
    for (let r = 0; r < total; r++) {
      const at = r * RECORD_BYTES;
      const lo = records[at]! | (records[at + 1]! << 8) | (records[at + 2]! << 16);
      const hi = records[at + 3]! | (records[at + 4]! << 8) | (records[at + 5]! << 16);
      out[r * 2] = lo >>> 0;
      out[r * 2 + 1] = hi >>> 0;
    }
    return out;
  }

  function upload(source: SourceType, catalog: StarCatalog): void {
    // Empty catalog is the unload signal (tier swaps that drop the bin):
    // release the source's buffers. `createBuffer({size:0})` is forbidden.
    if (catalog.records.length === 0) {
      const stale = sources.get(source);
      if (stale) {
        stale.recordsBuffer.destroy();
        destroyStreams(stale);
        sources.delete(source);
      }
      return;
    }

    const packed = repackRecords(catalog.records);
    const recordsBuffer = device.createBuffer({
      label: `star-catalog-records-${source}`,
      size: packed.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(recordsBuffer, 0, packed);
    const recordsBindGroup = device.createBindGroup({
      label: `star-catalog-records-bg-${source}`,
      layout: recordsBgl,
      entries: [{ binding: 0, resource: { buffer: recordsBuffer } }],
    });

    // GPU buffers are fixed-size — destroy and reallocate on replace.
    const prev = sources.get(source);
    if (prev) {
      prev.recordsBuffer.destroy();
      destroyStreams(prev);
    }

    sources.set(source, {
      catalog,
      recordsBuffer,
      recordsBindGroup,
      streams: { leaf: emptyStreamBuffers(), aggregate: emptyStreamBuffers() },
    });
  }

  /** Release both stream buffer pairs of a source (replace / unload / teardown). */
  function destroyStreams(entry: LoadedStarSource): void {
    for (const stream of ['leaf', 'aggregate'] as const) {
      entry.streams[stream].nodeParamsBuffer?.destroy();
      entry.streams[stream].prefixBuffer?.destroy();
    }
  }

  function* loadedCatalogsGen(): IterableIterator<{ source: SourceType; catalog: StarCatalog }> {
    for (const [source, entry] of sources) {
      yield { source, catalog: entry.catalog };
    }
  }
  function loadedCatalogs(): Iterable<{ source: SourceType; catalog: StarCatalog }> {
    return loadedCatalogsGen();
  }

  // ── Per-draw upload scratch (CPU), grown as the frame's draw count grows ───
  // Two reused CPU buffers copied by queue.writeBuffer (which snapshots
  // synchronously, so reuse across sources within a frame is safe): the
  // contiguous NodeParams block scratch, and the parallel prefix-sum scratch.
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
   * Grow one stream's NodeParams + prefix storage buffers to hold `drawCount`
   * slots (grow-only — GPU buffers are fixed-size, so re-create only when the
   * count exceeds capacity). The bind group over them is NOT built here: it is
   * rebuilt each frame with the exact bound size so `arrayLength(&prefix)` reads
   * the live draw count.
   */
  function ensureDrawBuffers(
    buffers: StreamBuffers,
    stream: StarDrawStream,
    drawCount: number,
  ): void {
    if (buffers.nodeParamsBuffer !== null && buffers.drawCapacity >= drawCount) return;
    buffers.nodeParamsBuffer?.destroy();
    buffers.prefixBuffer?.destroy();
    buffers.drawCapacity = drawCount;
    buffers.nodeParamsBuffer = device.createBuffer({
      label: `star-catalog-${stream}-node-params`,
      size: drawCount * NODE_PARAMS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    buffers.prefixBuffer = device.createBuffer({
      label: `star-catalog-${stream}-prefix`,
      size: drawCount * PREFIX_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  function draw(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs): void {
    const {
      source,
      stream,
      vp,
      viewportPx,
      drawCount,
      firstRecord,
      recordCount,
      originRelCamMpc,
      cellScaleMpc,
      isAggregate,
      subtreeStarCount,
      opacity,
      sizePx,
      brightness,
      glowOverlap,
      aggregateIntensityCap,
      frustumPlanes,
      glowMarginAngleRad,
    } = args;
    const entry = sources.get(source);
    if (!entry || drawCount === 0) return;
    const buffers = entry.streams[stream];

    // Camera uniform: identical bytes every source, so this repeated write is
    // idempotent (see the module header). floats 18/19 stay zero-init.
    // `sizePx`, `brightness`, `glowOverlap` and `aggregateIntensityCap` ride this
    // buffer too — all four are source-independent (the same base star-dot size +
    // exposure trim + glow spread + aggregate peak ceiling for every source this
    // frame), so appending them to the shared camera prefix is safe: each
    // source's repeated write lands the identical values. Written here, ONCE per
    // source before its draw, so there is no mid-frame mutation for the
    // writeBuffer/submit ordering race to corrupt.
    writeCameraPrefix(cameraScratch, vp, viewportPx);
    cameraScratch[SIZE_PX_FLOAT_INDEX] = sizePx;
    cameraScratch[BRIGHTNESS_FLOAT_INDEX] = brightness;
    cameraScratch[GLOW_OVERLAP_FLOAT_INDEX] = glowOverlap;
    cameraScratch[AGG_INTENSITY_CAP_FLOAT_INDEX] = aggregateIntensityCap;
    device.queue.writeBuffer(cameraBuffer, 0, cameraScratch);

    // Pack every SURVIVING draw's params contiguously and build the exclusive
    // prefix sum of record counts in the same pass. Culled nodes are skipped
    // entirely, so a separate output cursor `survivors` (≠ the loop index `i`)
    // keeps the packing contiguous — every buffer size, upload length and bind
    // size below is that survivor count, and `totalInstances` (the running sum's
    // end) is the single draw's instance count over survivors only. Scratch is
    // sized to the worst case (`drawCount` ≥ survivors) before the loop writes.
    ensureScratch(drawCount);
    let totalInstances = 0;
    let survivors = 0;
    for (let i = 0; i < drawCount; i++) {
      // Per-node arrays are the star cut's reused flat typed arrays, `drawCount`
      // valid entries: scalar fields index `i`, the origin vec3 indexes `3*i`.
      const o = i * 3;
      const ox = originRelCamMpc[o]!;
      const oy = originRelCamMpc[o + 1]!;
      const oz = originRelCamMpc[o + 2]!;
      const edge = cellScaleMpc[i]!;

      // Frustum cull (skipped when `frustumPlanes` is null — culling disabled).
      // The camera is the rebase origin, so node positions are camera-relative:
      // `originRelCamMpc` is the box MIN corner and records span [origin,
      // origin+edge) per axis, hence centre = origin + edge/2, half-diagonal =
      // edge·√3/2, and distance from the eye = length(centre). A conservative
      // (never-under-cull) bounding sphere is the box half-diagonal grown by the
      // node's on-screen spill: a LEAF draws as a fixed-pixel dot, so its world
      // spill is angular — `length(centre) · glowMarginAngleRad`; an AGGREGATE
      // fills its box footprint with glow that `glowOverlap`-spreads with the
      // dot-size scale, a WORLD slack. Conservative is safe: a false "inside"
      // merely draws an off-screen node, a false "outside" would drop a visible
      // one (forbidden), so both radii only ever grow the sphere.
      if (frustumPlanes !== null) {
        const cx = ox + edge * 0.5;
        const cy = oy + edge * 0.5;
        const cz = oz + edge * 0.5;
        const baseRadius = edge * 0.8660254; // edge·√3/2
        let cullRadius: number;
        if (isAggregate[i]! !== 0) {
          // This models the glow spill as pure world slack and omits the
          // `STAR_GLOW_MIN_PX` pixel floor the shader also applies to
          // aggregates (vertex.wesl, box radius floored before the
          // sizeScale/overlap spread). That's safe only because
          // `walkStarOctreeCut` commits aggregates at edge/dist ~ 0.08-0.16,
          // so their boxes already span tens-to-hundreds of pixels and the
          // floor never binds. If the walk's LOD threshold is ever lowered
          // enough that an aggregate's box could shrink toward ~1px on
          // screen, this cull would need the pick-style angular floor too.
          const sizeScale = sizePx / DEFAULT_STAR_SIZE_PX;
          const spread = sizeScale * glowOverlap;
          cullRadius = baseRadius * (spread > 1 ? spread : 1);
        } else {
          const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
          cullRadius = baseRadius + dist * glowMarginAngleRad;
        }
        if (sphereOutsideFrustum(frustumPlanes, cx, cy, cz, cullRadius)) continue;
      }

      // Per-node opacity = source crossfade × this node's LOD fade (see the
      // draw-args docblock). `writeStarNodeParams` owns the byte offsets; the
      // survivor is packed at the output cursor, not the loop index.
      writeStarNodeParams(
        nodeScratchView,
        survivors * NODE_PARAMS_BYTES,
        ox,
        oy,
        oz,
        edge,
        firstRecord[i]!,
        opacity[i]!,
        isAggregate[i]!,
        subtreeStarCount[i]!,
      );
      // Exclusive prefix: this draw's first global instance index is the sum of
      // all earlier survivors' record counts. Strictly increasing (every draw
      // has ≥ 1 record), so the shader's binary search resolves a unique slot.
      prefixScratch[survivors] = totalInstances;
      totalInstances += recordCount[i]!;
      survivors++;
    }

    // Every node culled ⇒ nothing to draw: return before any GPU work (the
    // second early return after the `drawCount === 0` guard above).
    if (survivors === 0) return;

    ensureDrawBuffers(buffers, stream, survivors);
    device.queue.writeBuffer(
      buffers.nodeParamsBuffer!,
      0,
      nodeScratch,
      0,
      survivors * NODE_PARAMS_BYTES,
    );
    device.queue.writeBuffer(buffers.prefixBuffer!, 0, prefixScratch, 0, survivors);

    // Bind group rebuilt per frame with the EXACT bound size (grow-only buffers
    // may over-allocate) so `arrayLength(&prefix)` yields exactly `survivors`.
    const drawBindGroup = device.createBindGroup({
      label: `star-catalog-${stream}-draw-bg`,
      layout: drawBgl,
      entries: [
        {
          binding: 0,
          resource: { buffer: buffers.nodeParamsBuffer!, size: survivors * NODE_PARAMS_BYTES },
        },
        { binding: 1, resource: { buffer: buffers.prefixBuffer!, size: survivors * PREFIX_BYTES } },
      ],
    });

    pass.setPipeline(pipelines[stream]);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, drawBindGroup);
    pass.setBindGroup(2, entry.recordsBindGroup);
    // ONE instanced draw for the whole cut: the vertex stage routes each instance
    // to its owning draw slot by binary-searching the prefix sum (see vertex.wesl).
    pass.draw(3, totalInstances);
  }

  /**
   * The resources the sibling `starCatalogPickRenderer` shares to keep its own
   * r32uint pick pipeline bind-group compatible: the three explicit BGLs (so its
   * pick pipeline layout is group-equivalent) plus the per-source records bind
   * group (uploaded once here, bound verbatim by the pick draw — the pick pass
   * re-uses the static record blob rather than re-uploading). The pick renderer
   * builds its OWN camera + node-params buffers against `cameraBgl` / `drawBgl`,
   * so the writeBuffer/submit ordering trap can never let a pick draw scribble on
   * this renderer's live buffers. `recordsBindGroup` reads the live `sources`
   * map, so a tier swap that unloads a source correctly returns `null`.
   */
  function pickResources(): StarCatalogPickResources {
    return {
      cameraBgl,
      drawBgl,
      recordsBgl,
      recordsBindGroup: (source) => sources.get(source)?.recordsBindGroup ?? null,
    };
  }

  function destroy(): void {
    for (const entry of sources.values()) {
      entry.recordsBuffer.destroy();
      destroyStreams(entry);
    }
    sources.clear();
    cameraBuffer.destroy();
  }

  const renderer: StarCatalogRenderer = {
    label: 'starCatalogRenderer',
    upload,
    loadedCatalogs,
    draw,
    pickResources,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
