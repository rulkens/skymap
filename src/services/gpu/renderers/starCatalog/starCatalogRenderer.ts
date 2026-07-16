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
 * ### How each per-node draw reads its params, and the writeBuffer trap
 *
 * Every drawn node needs three things NOT in the record: its box origin
 * (camera-relative), its box scale, and its record-slice base. Those go in a
 * `NodeParams` uniform the pipeline binds at `@group(1)` with a DYNAMIC
 * OFFSET — one 256-byte-strided block per node in a single per-source buffer,
 * written ONCE per frame before any draw. The per-node draw then selects its
 * block by changing only the dynamic offset (a bind, not a buffer write), so
 * there is no mid-frame uniform mutation for the WebGPU writeBuffer/submit
 * ordering race to corrupt (CLAUDE.md's landmine — all `queue.writeBuffer`
 * calls execute before the frame's single `submit`, so a per-draw-mutated
 * shared uniform would read only its LAST written value at draw time).
 *
 * That same ordering rule is why the node-params buffer is PER SOURCE, not
 * one shared buffer written per source: two sources writing one buffer would
 * both land before submit, and the first source's draws would read the
 * second source's data. Distinct per-source buffers each retain their own
 * data. (The camera uniform IS shared across sources — its bytes are
 * identical every source in a frame, so the repeated write is idempotent.)
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
 * Meaningful bytes of the `NodeParams` uniform struct (WGSL std140):
 * originRelCamMpc vec3 (0..11) + cellScaleMpc f32 (12..15) + firstRecord u32
 * (16..19) + opacity f32 (20..23) + level u32 (24..27), rounded up to the
 * vec3's 16-byte alignment = 32. `level` rides the pad that alignment already
 * reserved, so adding it did NOT change this size. This is the bound window
 * SIZE; the per-node dynamic offset strides by `nodeParamStride` (>= this,
 * aligned to the device limit).
 */
const NODE_PARAMS_BYTES = 32;

/** Round `value` up to the next multiple of `align` (a power of two). */
function alignUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/**
 * Byte size of the star `StarUniforms` @group(0) buffer: the shared
 * `CameraUniforms` prefix + `sizePx` f32 + `brightness` f32, rounded up to the
 * prefix's 16-byte alignment = 96 (mirrors `struct StarUniforms` in
 * shaders/starCatalog/io.wesl). The two appended scalars fit inside the same
 * 16-byte rounding tail as `sizePx` alone did, so the buffer size is unchanged;
 * derived from `CAMERA_UNIFORM_BYTES` so the prefix size stays single-sourced,
 * the way the galaxy points `Uniforms` struct appends its own scalars.
 */
const STAR_UNIFORM_BYTES = alignUp(CAMERA_UNIFORM_BYTES + 8, 16);

/**
 * Float index of `sizePx` in the `StarUniforms` scratch: byte 80 (right after
 * the camera prefix) / 4.
 */
const SIZE_PX_FLOAT_INDEX = CAMERA_UNIFORM_BYTES / 4;

/**
 * Float index of `brightness` in the `StarUniforms` scratch: byte 84 (right
 * after `sizePx`) / 4. Floats 22..23 stay zero-init pad.
 */
const BRIGHTNESS_FLOAT_INDEX = (CAMERA_UNIFORM_BYTES + 4) / 4;

/** One committed catalog's GPU resources + the octree kept for the layer. */
type LoadedStarSource = {
  catalog: StarCatalog;
  /** The repacked record blob (`array<u32>`, two u32 per record). */
  recordsBuffer: GPUBuffer;
  /** `@group(2)` bind group over `recordsBuffer`, built at upload. */
  recordsBindGroup: GPUBindGroup;
  /**
   * Per-source `NodeParams` uniform, grown as the frame's node count grows.
   * Written once per frame (in this source's `draw`); the per-node draw
   * selects a block via dynamic offset. Per-source (not shared) so a second
   * source's write cannot clobber this one's data before submit.
   */
  nodeParamsBuffer: GPUBuffer | null;
  /** `@group(1)` dynamic-offset bind group over `nodeParamsBuffer`. */
  nodeParamsBindGroup: GPUBindGroup | null;
  /** Capacity of `nodeParamsBuffer` in node blocks (grow-only). */
  nodeCapacity: number;
};

export function createStarCatalogRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StarCatalogRenderer {
  // Dynamic-offset stride: the device's uniform-offset alignment (256 on most
  // hardware), never smaller than the struct itself.
  const nodeParamStride = alignUp(
    NODE_PARAMS_BYTES,
    device.limits.minUniformBufferOffsetAlignment,
  );

  // ── Camera uniform (shared across sources — see the module header) ────────
  // Sized to STAR_UNIFORM_BYTES: the 80-byte CameraUniforms prefix plus the
  // source-independent `sizePx` + `brightness` scalars, matching `struct
  // StarUniforms`.
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
  const nodeParamsBgl = device.createBindGroupLayout({
    label: 'star-catalog-node-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        // Dynamic offset: one bind group, re-pointed per node by offset alone.
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: NODE_PARAMS_BYTES },
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
      bindGroupLayouts: [cameraBgl, nodeParamsBgl, recordsBgl],
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
    }

    sources.set(source, {
      catalog,
      recordsBuffer,
      recordsBindGroup,
      nodeParamsBuffer: null,
      nodeParamsBindGroup: null,
      nodeCapacity: 0,
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

  // ── Per-node params scratch (CPU), grown as node counts grow ──────────────
  // One reused ArrayBuffer for the whole strided upload; queue.writeBuffer
  // copies it synchronously, so reuse across sources within a frame is safe.
  let nodeScratch = new ArrayBuffer(0);
  let nodeScratchView = new DataView(nodeScratch);

  function ensureScratch(nodeCount: number): void {
    const needed = nodeCount * nodeParamStride;
    if (nodeScratch.byteLength < needed) {
      nodeScratch = new ArrayBuffer(needed);
      nodeScratchView = new DataView(nodeScratch);
    }
  }

  /** Grow a source's node-params buffer + bind group to hold `nodeCount` blocks. */
  function ensureNodeParamsBuffer(entry: LoadedStarSource, nodeCount: number): void {
    if (entry.nodeParamsBuffer !== null && entry.nodeCapacity >= nodeCount) return;
    entry.nodeParamsBuffer?.destroy();
    entry.nodeCapacity = nodeCount;
    entry.nodeParamsBuffer = device.createBuffer({
      label: 'star-catalog-node-params',
      size: nodeCount * nodeParamStride,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    entry.nodeParamsBindGroup = device.createBindGroup({
      label: 'star-catalog-node-bg',
      layout: nodeParamsBgl,
      entries: [
        { binding: 0, resource: { buffer: entry.nodeParamsBuffer, size: NODE_PARAMS_BYTES } },
      ],
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
      level,
      opacity,
      sizePx,
      brightness,
    } = args;
    const entry = sources.get(source);
    if (!entry || nodeDraws.length === 0) return;

    // Camera uniform: identical bytes every source, so this repeated write is
    // idempotent (see the module header). floats 18/19 stay zero-init.
    // `sizePx` and `brightness` ride this buffer too — both are
    // source-independent (the same base star-dot size + exposure trim for every
    // source this frame), so appending them to the shared camera prefix is safe:
    // each source's repeated write lands the identical values. Written here,
    // ONCE per source before its draws, so there is no mid-frame mutation for
    // the writeBuffer/submit ordering race to corrupt.
    writeCameraPrefix(cameraScratch, vp, viewportPx);
    cameraScratch[SIZE_PX_FLOAT_INDEX] = sizePx;
    cameraScratch[BRIGHTNESS_FLOAT_INDEX] = brightness;
    device.queue.writeBuffer(cameraBuffer, 0, cameraScratch);

    // Pack every node's params into the strided scratch, once, then one write.
    ensureScratch(nodeDraws.length);
    for (let i = 0; i < nodeDraws.length; i++) {
      const base = i * nodeParamStride;
      const o = originRelCamMpc[i]!;
      nodeScratchView.setFloat32(base + 0, o[0], true);
      nodeScratchView.setFloat32(base + 4, o[1], true);
      nodeScratchView.setFloat32(base + 8, o[2], true);
      nodeScratchView.setFloat32(base + 12, cellScaleMpc[i]!, true);
      nodeScratchView.setUint32(base + 16, nodeDraws[i]!.firstRecord >>> 0, true);
      nodeScratchView.setFloat32(base + 20, opacity, true);
      nodeScratchView.setUint32(base + 24, level[i]! >>> 0, true);
    }
    ensureNodeParamsBuffer(entry, nodeDraws.length);
    device.queue.writeBuffer(
      entry.nodeParamsBuffer!,
      0,
      nodeScratch,
      0,
      nodeDraws.length * nodeParamStride,
    );

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(2, entry.recordsBindGroup);
    for (let i = 0; i < nodeDraws.length; i++) {
      // Dynamic offset selects this node's block — a bind, not a write.
      pass.setBindGroup(1, entry.nodeParamsBindGroup!, [i * nodeParamStride]);
      pass.draw(3, nodeDraws[i]!.recordCount);
    }
  }

  function destroy(): void {
    for (const entry of sources.values()) {
      entry.recordsBuffer.destroy();
      entry.nodeParamsBuffer?.destroy();
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
