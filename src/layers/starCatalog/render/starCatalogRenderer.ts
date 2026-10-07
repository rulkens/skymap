/**
 * starCatalogRenderer — the survey (Gaia bin) stars as additive point sprites
 * in the depthless HDR accumulation, fed from an in-file octree of
 * cell-quantized 6-byte records.
 *
 * ### Why a dedicated pipeline (not `starPointRenderer`, not `galaxyPointRenderer`)
 *
 * The survey stars' positions live as 10-bit in-cell offsets inside 6-byte
 * records, reconstructed in the vertex stage against their octree node's box.
 * Neither a flat instance buffer of seeded stars nor the galaxies' 52-byte
 * interleaved layout has that shape, so this is its own thin pipeline, sharing
 * the common substance at the WESL level (`lib/camera`, `lib/billboard`).
 *
 * ### Storage vs frame
 *
 * A catalog's record blob is static: uploaded once per source (`upload`). What
 * changes per frame is the octree CUT — which nodes draw — and that is taken
 * on the GPU (`starCutGpu`): this renderer sets the frame's inputs, encodes
 * the compute, and draws each stream with one `drawIndirect` over the lists it
 * left. No node, count or list crosses to JS.
 *
 * ### Two streams — leaf into HDR, aggregate into a half-res offscreen
 *
 * The cut splits into a LEAF list (real stars) and an AGGREGATE list (interior
 * flux-mip glows). Aggregate glow FILL is the star pass's dominant GPU cost,
 * so the aggregates draw LINEAR into the half-res `star-aggregates` offscreen
 * (fragment `fsLinear`), which the `star-upsample` composite knees and adds
 * back; the leaves draw into full-res HDR (fragment `fs`, per-glow knee). Both
 * targets are `rgba16float`, so one `targetFormat` builds both pipelines.
 *
 * ### Record repack at upload — 6 bytes → two u32
 *
 * The on-disk record is two independent 24-bit halves (`packStarRecord`; JS
 * bitwise ops are signed-32). A 6-byte blob is not 4-byte-aligned per record,
 * so `upload` repacks each into two u32 the vertex stage indexes as
 * `records[base*2]` / `records[base*2+1]`. The 8/6 VRAM overhead buys aligned
 * addressing.
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { StarCatalogRenderer } from '../@types/StarCatalogRenderer';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogPickResources } from '../@types/StarCatalogPickResources';
import type { StarCatalogCutDrawArgs } from '../@types/StarCatalogCutDrawArgs';
import type { StarCutFrame } from '../@types/StarCutFrame';
import { RECORD_BYTES } from '../../../data/starCatalog/starCatalogFormat';
import vsCode from '../../../services/gpu/shaders/starCatalog/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/starCatalog/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { writeCameraPrefix } from '../../../services/gpu/lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { createViewSlotUniformRing } from '../../../utils/gpu/createViewSlotUniformRing';
// The `StarUniforms` byte layout lives in starCatalogLayout.ts, shared with the
// pick renderer. This renderer never writes `pickPass`: its scratch is
// zero-init, so the vertex stage takes the visual path.
import {
  STAR_UNIFORM_BYTES,
  SIZE_PX_FLOAT_INDEX,
  BRIGHTNESS_FLOAT_INDEX,
  GLOW_OVERLAP_FLOAT_INDEX,
  AGG_INTENSITY_CAP_FLOAT_INDEX,
  PX_PER_RAD_FLOAT_INDEX,
} from './starCatalogLayout';
import { createStarCutGpu } from './starCutGpu';

/** One committed catalog's GPU records + the octree kept for the layer. */
type LoadedStarSource = {
  catalog: StarCatalog;
  /** The repacked record blob (`array<u32>`, two u32 per record). */
  recordsBuffer: GPUBuffer;
  /** `@group(2)` bind group over `recordsBuffer`, built at upload. */
  recordsBindGroup: GPUBindGroup;
};

export function createStarCatalogRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StarCatalogRenderer {
  // The frame's one star cut (see `setFrameCut`'s doc): ONE fact for the whole
  // frame, so plain closure state rather than a WeakMap keyed per ctx.
  let frameCut: StarCutFrame | null = null;
  const cut = createStarCutGpu(device);

  const cameraScratch = new Float32Array(STAR_UNIFORM_BYTES / 4);

  // Explicit layouts, not 'auto' — layouts don't cross pipelines.
  const cameraBgl = device.createBindGroupLayout({
    label: 'star-catalog-camera-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  // One camera buffer per view slot: a capture sweep's faces and the real view
  // each carry a different vp, all before one `submit()`, and a shared buffer
  // would hand every draw the LAST write (docs/RENDERER.md landmine #1).
  // And one ring per stream: in the real view the aggregate stream rasterises
  // a half-res target, so its viewport and pxPerRad differ from the leaf's.
  const makeCameraRing = (stream: string) =>
    createViewSlotUniformRing({
      device,
      label: `star-catalog-camera-uniform-${stream}`,
      byteSize: STAR_UNIFORM_BYTES,
      layout: cameraBgl,
    });
  const cameraRings = { leaf: makeCameraRing('leaf'), aggregate: makeCameraRing('aggregate') };
  const recordsBgl = device.createBindGroupLayout({
    label: 'star-catalog-records-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'starCatalog.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'starCatalog.fragment');
  const pipelineLayout = device.createPipelineLayout({
    label: 'star-catalog-pipeline-layout',
    bindGroupLayouts: [cameraBgl, cut.drawBgl, recordsBgl],
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
  // Keyed by COMPRESSION, not by stream: the aggregate stream takes the
  // knee'd pipeline when it draws somewhere the knee'd upsample can't follow
  // it (a sky-cubemap capture face — see `StarCatalogCutDrawArgs.knee`).
  const pipelines = {
    kneed: makePipeline('star-catalog-kneed-pipeline', 'fs'),
    linear: makePipeline('star-catalog-linear-pipeline', 'fsLinear'),
  };

  const sources = new Map<SourceType, LoadedStarSource>();

  /**
   * Repack the catalog's 6-byte records into two u32 each (`lo` = on-disk
   * bytes 0..2, `hi` = bytes 3..5), mirroring packStarRecord's byte order.
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
    cut.upload(source, catalog);
    // GPU buffers are fixed-size — destroy and reallocate on replace.
    sources.get(source)?.recordsBuffer.destroy();
    sources.delete(source);
    // Empty catalog is the unload signal (a tier swap that drops the bin);
    // `createBuffer({size:0})` is forbidden.
    if (catalog.records.length === 0) return;

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
    sources.set(source, { catalog, recordsBuffer, recordsBindGroup });
  }

  function* loadedCatalogs(): IterableIterator<{ source: SourceType; catalog: StarCatalog }> {
    for (const [source, entry] of sources) {
      yield { source, catalog: entry.catalog };
    }
  }

  function drawCut(pass: GPURenderPassEncoder, args: StarCatalogCutDrawArgs): void {
    const entry = sources.get(args.source);
    if (args.capture && frameCut !== null) cut.submitCapture(frameCut);
    const cutDraw = cut.drawOf(args.source, args.stream, args.capture);
    if (!entry || cutDraw === null) return;

    // Identical bytes for every source within one view slot, so the repeated
    // write is idempotent. float 19 stays zero-init.
    writeCameraPrefix(cameraScratch, args.vp, args.viewportPx, args.pxPerRad);
    cameraScratch[SIZE_PX_FLOAT_INDEX] = args.sizePx;
    cameraScratch[BRIGHTNESS_FLOAT_INDEX] = args.brightness;
    cameraScratch[GLOW_OVERLAP_FLOAT_INDEX] = args.glowOverlap;
    cameraScratch[AGG_INTENSITY_CAP_FLOAT_INDEX] = args.aggregateIntensityCap;
    cameraScratch[PX_PER_RAD_FLOAT_INDEX] = args.pxPerRad;
    const cameraRing = cameraRings[args.stream];
    cameraRing.writeSlot(args.viewSlot, cameraScratch);

    pass.setPipeline(args.knee ? pipelines.kneed : pipelines.linear);
    pass.setBindGroup(0, cameraRing.bindGroupOf(args.viewSlot));
    pass.setBindGroup(1, cutDraw.bindGroup);
    pass.setBindGroup(2, entry.recordsBindGroup);
    pass.drawIndirect(cutDraw.indirect, cutDraw.indirectOffset);
  }

  /**
   * What the sibling `starCatalogPickRenderer` shares: the three BGLs (so its
   * pick pipeline is group-equivalent), the records bind group, and the frame
   * cut's leaf list. It builds its OWN camera buffer against `cameraBgl`, so a
   * pick draw can never scribble on this renderer's live one.
   */
  function pickResources(): StarCatalogPickResources {
    return {
      cameraBgl,
      drawBgl: cut.drawBgl,
      recordsBgl,
      recordsBindGroup: (source) => sources.get(source)?.recordsBindGroup ?? null,
      leafDraw: (source) => cut.drawOf(source, 'leaf', false),
    };
  }

  function destroy(): void {
    for (const entry of sources.values()) entry.recordsBuffer.destroy();
    sources.clear();
    cut.destroy();
    cameraRings.leaf.destroy();
    cameraRings.aggregate.destroy();
  }

  const renderer: StarCatalogRenderer = {
    label: 'starCatalogRenderer',
    upload,
    loadedCatalogs,
    drawCut,
    encodeCut: (encoder, claimTimestampWrites) => {
      if (frameCut !== null) cut.encode(encoder, frameCut, claimTimestampWrites);
    },
    pickResources,
    setFrameCut: (next) => {
      frameCut = next;
    },
    getFrameCut: () => frameCut,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
