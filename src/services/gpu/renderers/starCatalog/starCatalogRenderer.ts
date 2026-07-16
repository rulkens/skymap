/**
 * starCatalogRenderer — the survey (Gaia bin) stars as additive point sprites
 * in the depthless HDR accumulation, fed from an in-file octree of
 * cell-quantized 6-byte records.
 *
 * ### Why a dedicated pipeline (not `starPointRenderer`, not `pointRenderer`)
 *
 * `starPointRenderer` draws a flat instance buffer of a handful of seeded
 * scene stars; it has no notion of an octree, a per-node origin, or a
 * vertex-pulled record. `pointRenderer` bakes a `GalaxyCatalog` into a
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
} from '../../../../@types/rendering/StarCatalogRenderer';
import type { SourceType } from '../../../../@types/data/SourceType';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import { RECORD_BYTES } from '../../../../data/starCatalog/starCatalogFormat';
import vsCode from '../../shaders/starCatalog/vertex.wesl?static';
import fsCode from '../../shaders/starCatalog/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

/**
 * Bytes of one `NodeParams` element in the `array<NodeParams>` storage buffer:
 * originRelCamMpc vec3 (0..11) + cellScaleMpc f32 (12..15) + firstRecord u32
 * (16..19) + opacity f32 (20..23) + isAggregate u32 (24..27) + subtreeStarCount
 * f32 (28..31), rounded up to the vec3's 16-byte alignment = 32. Under WGSL
 * std430 (storage) the array stride is that 16-byte-aligned struct size — the
 * same 32 the std140 window was — so the CPU packs draws back-to-back at this
 * stride with no gaps. `isAggregate` and `subtreeStarCount` ride the pad the
 * vec3 alignment already reserved, so adding them did NOT change this size.
 */
const NODE_PARAMS_BYTES = 32;

/** Bytes of one `prefix` element (a `u32` exclusive instance-start index). */
const PREFIX_BYTES = 4;

/** Round `value` up to the next multiple of `align` (a power of two). */
function alignUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/**
 * Byte size of the star `StarUniforms` @group(0) buffer: the shared
 * `CameraUniforms` prefix + `sizePx` f32 + `brightness` f32 + `glowOverlap` f32,
 * rounded up to the prefix's 16-byte alignment = 96 (mirrors `struct
 * StarUniforms` in shaders/starCatalog/io.wesl). The three appended scalars fit
 * inside the same 16-byte rounding tail as `sizePx` alone did (80 + 12 → 96), so
 * the buffer size is unchanged; derived from `CAMERA_UNIFORM_BYTES` so the
 * prefix size stays single-sourced, the way the galaxy points `Uniforms` struct
 * appends its own scalars.
 */
const STAR_UNIFORM_BYTES = alignUp(CAMERA_UNIFORM_BYTES + 12, 16);

/**
 * Float index of `sizePx` in the `StarUniforms` scratch: byte 80 (right after
 * the camera prefix) / 4.
 */
const SIZE_PX_FLOAT_INDEX = CAMERA_UNIFORM_BYTES / 4;

/**
 * Float index of `brightness` in the `StarUniforms` scratch: byte 84 (right
 * after `sizePx`) / 4.
 */
const BRIGHTNESS_FLOAT_INDEX = (CAMERA_UNIFORM_BYTES + 4) / 4;

/**
 * Float index of `glowOverlap` in the `StarUniforms` scratch: byte 88 (right
 * after `brightness`) / 4. Float 23 stays zero-init pad.
 */
const GLOW_OVERLAP_FLOAT_INDEX = (CAMERA_UNIFORM_BYTES + 8) / 4;

/** One committed catalog's GPU resources + the octree kept for the layer. */
type LoadedStarSource = {
  catalog: StarCatalog;
  /** The repacked record blob (`array<u32>`, two u32 per record). */
  recordsBuffer: GPUBuffer;
  /** `@group(2)` bind group over `recordsBuffer`, built at upload. */
  recordsBindGroup: GPUBindGroup;
  /**
   * Per-source `array<NodeParams>` storage buffer, grown as the frame's draw
   * count grows. Written once per frame (in this source's `draw`). Per-source
   * (not shared) so a second source's write cannot clobber this one's data
   * before submit.
   */
  nodeParamsBuffer: GPUBuffer | null;
  /** Per-source `array<u32>` prefix-sum storage buffer, grown alongside. */
  prefixBuffer: GPUBuffer | null;
  /** Capacity of `nodeParamsBuffer`/`prefixBuffer` in draw slots (grow-only). */
  drawCapacity: number;
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

  const pipeline = device.createRenderPipeline({
    label: 'star-catalog-pipeline',
    layout: device.createPipelineLayout({
      label: 'star-catalog-pipeline-layout',
      bindGroupLayouts: [cameraBgl, drawBgl, recordsBgl],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' }, // records vertex-pulled, no vertex buffers
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      // One/one additive on premultiplied output — overlapping stars brighten.
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    // Three vertices per instanced circumscribing-triangle billboard.
    primitive: { topology: 'triangle-list' },
    // NO depthStencil: the hdr target has no depth attachment.
  });

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
        stale.nodeParamsBuffer?.destroy();
        stale.prefixBuffer?.destroy();
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
      prev.nodeParamsBuffer?.destroy();
      prev.prefixBuffer?.destroy();
    }

    sources.set(source, {
      catalog,
      recordsBuffer,
      recordsBindGroup,
      nodeParamsBuffer: null,
      prefixBuffer: null,
      drawCapacity: 0,
    });
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
   * Grow a source's NodeParams + prefix storage buffers to hold `drawCount`
   * slots (grow-only — GPU buffers are fixed-size, so re-create only when the
   * count exceeds capacity). The bind group over them is NOT built here: it is
   * rebuilt each frame with the exact bound size so `arrayLength(&prefix)` reads
   * the live draw count.
   */
  function ensureDrawBuffers(entry: LoadedStarSource, drawCount: number): void {
    if (entry.nodeParamsBuffer !== null && entry.drawCapacity >= drawCount) return;
    entry.nodeParamsBuffer?.destroy();
    entry.prefixBuffer?.destroy();
    entry.drawCapacity = drawCount;
    entry.nodeParamsBuffer = device.createBuffer({
      label: 'star-catalog-node-params',
      size: drawCount * NODE_PARAMS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    entry.prefixBuffer = device.createBuffer({
      label: 'star-catalog-prefix',
      size: drawCount * PREFIX_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  function draw(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs): void {
    const {
      source,
      vp,
      viewportPx,
      nodeDraws,
      originRelCamMpc,
      cellScaleMpc,
      isAggregate,
      subtreeStarCount,
      opacity,
      sizePx,
      brightness,
      glowOverlap,
    } = args;
    const entry = sources.get(source);
    const drawCount = nodeDraws.length;
    if (!entry || drawCount === 0) return;

    // Camera uniform: identical bytes every source, so this repeated write is
    // idempotent (see the module header). floats 18/19 stay zero-init.
    // `sizePx`, `brightness` and `glowOverlap` ride this buffer too — all three
    // are source-independent (the same base star-dot size + exposure trim + glow
    // spread for every source this frame), so appending them to the shared
    // camera prefix is safe: each source's repeated write lands the identical
    // values. Written here, ONCE per source before its draw, so there is no
    // mid-frame mutation for the writeBuffer/submit ordering race to corrupt.
    writeCameraPrefix(cameraScratch, vp, viewportPx);
    cameraScratch[SIZE_PX_FLOAT_INDEX] = sizePx;
    cameraScratch[BRIGHTNESS_FLOAT_INDEX] = brightness;
    cameraScratch[GLOW_OVERLAP_FLOAT_INDEX] = glowOverlap;
    device.queue.writeBuffer(cameraBuffer, 0, cameraScratch);

    // Pack every draw's params contiguously and build the exclusive prefix sum
    // of record counts in the same pass; `totalInstances` is the running sum's
    // end — the single draw's instance count.
    ensureScratch(drawCount);
    let totalInstances = 0;
    for (let i = 0; i < drawCount; i++) {
      const base = i * NODE_PARAMS_BYTES;
      const o = originRelCamMpc[i]!;
      nodeScratchView.setFloat32(base + 0, o[0], true);
      nodeScratchView.setFloat32(base + 4, o[1], true);
      nodeScratchView.setFloat32(base + 8, o[2], true);
      nodeScratchView.setFloat32(base + 12, cellScaleMpc[i]!, true);
      nodeScratchView.setUint32(base + 16, nodeDraws[i]!.firstRecord >>> 0, true);
      // Per-node opacity = source crossfade × this node's LOD fade (see the
      // draw-args docblock). Parallel to `nodeDraws`, so index `i` here.
      nodeScratchView.setFloat32(base + 20, opacity[i]!, true);
      nodeScratchView.setUint32(base + 24, isAggregate[i]! >>> 0, true);
      nodeScratchView.setFloat32(base + 28, subtreeStarCount[i]!, true);
      // Exclusive prefix: this draw's first global instance index is the sum of
      // all earlier draws' record counts. Strictly increasing (every draw has
      // ≥ 1 record), so the shader's binary search resolves a unique slot.
      prefixScratch[i] = totalInstances;
      totalInstances += nodeDraws[i]!.recordCount;
    }

    ensureDrawBuffers(entry, drawCount);
    device.queue.writeBuffer(entry.nodeParamsBuffer!, 0, nodeScratch, 0, drawCount * NODE_PARAMS_BYTES);
    device.queue.writeBuffer(entry.prefixBuffer!, 0, prefixScratch, 0, drawCount);

    // Bind group rebuilt per frame with the EXACT bound size (grow-only buffers
    // may over-allocate) so `arrayLength(&prefix)` yields exactly `drawCount`.
    const drawBindGroup = device.createBindGroup({
      label: 'star-catalog-draw-bg',
      layout: drawBgl,
      entries: [
        {
          binding: 0,
          resource: { buffer: entry.nodeParamsBuffer!, size: drawCount * NODE_PARAMS_BYTES },
        },
        { binding: 1, resource: { buffer: entry.prefixBuffer!, size: drawCount * PREFIX_BYTES } },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, drawBindGroup);
    pass.setBindGroup(2, entry.recordsBindGroup);
    // ONE instanced draw for the whole cut: the vertex stage routes each instance
    // to its owning draw slot by binary-searching the prefix sum (see vertex.wesl).
    pass.draw(3, totalInstances);
  }

  function destroy(): void {
    for (const entry of sources.values()) {
      entry.recordsBuffer.destroy();
      entry.nodeParamsBuffer?.destroy();
      entry.prefixBuffer?.destroy();
    }
    sources.clear();
    cameraBuffer.destroy();
  }

  const renderer: StarCatalogRenderer = {
    label: 'starCatalogRenderer',
    upload,
    loadedCatalogs,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
