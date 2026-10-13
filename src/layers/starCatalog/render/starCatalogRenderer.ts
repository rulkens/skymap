/**
 * starCatalogRenderer — the survey (Gaia bin) stars as additive point sprites in
 * the depthless HDR accumulation. Its own pipeline: records are two u32 each
 * (`packStarGpuRecords`), vertex-pulled and rebuilt against their node's box.
 * `upload` commits a catalog once; the per-frame cut is taken on the GPU
 * (`starCutGpu`) from the inputs `setFrameCut` holds, and each stream draws with
 * one `drawIndirect`. Leaves go to full-res HDR (`fs`), aggregates LINEAR to the
 * low-res `star-aggregates` offscreen (`fsLinear`); both are rgba16float.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { StarCatalogRenderer } from '../@types/StarCatalogRenderer';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { StarCatalogPickResources } from '../@types/StarCatalogPickResources';
import type { StarCatalogCutDrawArgs } from '../@types/StarCatalogCutDrawArgs';
import type { StarCutInputs } from '../@types/StarCutInputs';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import type { StarDrawStream } from '../@types/StarDrawStream';
import type { StarChunkHost } from '../@types/StarChunkHost';
import { GPU_RECORD_WORDS, packStarGpuRecords } from '../../../utils/star/packStarGpuRecords';
import vsCode from '../../../services/gpu/shaders/starCatalog/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/starCatalog/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { writeCameraPrefix } from '../../../services/gpu/lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { createViewSlotUniformRing } from '../../../utils/gpu/createViewSlotUniformRing';
import {
  STAR_UNIFORM_BYTES,
  SIZE_PX_FLOAT_INDEX,
  BRIGHTNESS_FLOAT_INDEX,
  GLOW_OVERLAP_FLOAT_INDEX,
  AGG_INTENSITY_CAP_FLOAT_INDEX,
  PX_PER_RAD_FLOAT_INDEX,
  writeStarFocus,
} from './starCatalogLayout';
import { createStarCutGpu } from './starCutGpu';
import { WORD_BYTES } from './starCutLayout';

const GPU_RECORD_BYTES = GPU_RECORD_WORDS * WORD_BYTES;

/** One committed catalog's GPU records + the octree kept for the layer. */
type LoadedStarSource = {
  octree: StarOctree;
  slots: number;
  /** The chunk each slot holds: the pick's pool index ↔ ordinal map, and a host slot's rows. */
  slotChunks: (StarChunk | null)[];
  /** `slotChunks` at the last pick draw: a readback names what was drawn, not what landed since. */
  pickSlotChunks: (StarChunk | null)[];
  /** `packStarGpuRecords`' blob (`array<u32>`, two u32 per record). */
  recordsBuffer: GPUBuffer;
  /** `@group(2)` bind group over `recordsBuffer`, built at upload. */
  recordsBindGroup: GPUBindGroup;
};

export function createStarCatalogRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StarCatalogRenderer {
  // ONE fact for the whole frame, so plain closure state, not a map keyed per ctx.
  let frameCut: StarCutInputs | null = null;
  let frameRecut = true;
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
  // a low-res target, so its viewport and pxPerRad differ from the leaf's.
  const makeCameraRing = (stream: StarDrawStream) =>
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
  // Keyed by COMPRESSION, not by stream (see the pick in `drawCut`).
  const pipelines = {
    kneed: makePipeline('star-catalog-kneed-pipeline', 'fs'),
    linear: makePipeline('star-catalog-linear-pipeline', 'fsLinear'),
  };

  const sources = new Map<SourceType, LoadedStarSource>();

  function upload(source: SourceType, octree: StarOctree, slots: number): number {
    const poolSlots = Math.min(slots, octree.chunkCount);
    // Throws past a pool cap before anything below is created or released.
    cut.upload(source, octree, poolSlots);
    // `createBuffer({size:0})` is forbidden, and a degenerate bake (a `--limit` dev run)
    // can leave no records.
    const packed = octree.records.count === 0 ? null : packStarGpuRecords(octree.records);
    // GPU buffers are fixed-size — destroy and reallocate on replace.
    sources.get(source)?.recordsBuffer.destroy();
    sources.delete(source);
    if (packed === null) return poolSlots;

    const recordsBuffer = device.createBuffer({
      label: `star-catalog-records-${source}`,
      size: (octree.records.count + poolSlots * octree.chunkCapacity) * GPU_RECORD_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(recordsBuffer, 0, packed);
    const recordsBindGroup = device.createBindGroup({
      label: `star-catalog-records-bg-${source}`,
      layout: recordsBgl,
      entries: [{ binding: 0, resource: { buffer: recordsBuffer } }],
    });
    sources.set(source, {
      octree,
      slots: poolSlots,
      slotChunks: new Array<StarChunk | null>(poolSlots).fill(null),
      pickSlotChunks: new Array<StarChunk | null>(poolSlots).fill(null),
      recordsBuffer,
      recordsBindGroup,
    });
    return poolSlots;
  }

  function hostOf(
    { octree, slotChunks }: LoadedStarSource,
    hostSlot: number | null,
  ): StarChunkHost {
    if (hostSlot === null) return { nodes: octree.nodes, nodeBase: 0 };
    return {
      nodes: slotChunks[hostSlot]!.nodes,
      nodeBase: octree.nodes.count + hostSlot * octree.chunkNodeCap,
    };
  }

  function uploadChunk(
    source: SourceType,
    slot: number,
    chunk: StarChunk,
    hostSlot: number | null,
  ): void {
    const entry = sources.get(source);
    if (entry === undefined || slot < 0 || slot >= entry.slots) {
      throw new Error(`starCatalogRenderer: no slot ${slot} for source ${source}`);
    }
    const { octree } = entry;
    const host = hostOf(entry, hostSlot);
    // The records land before the cut marks the chunk's roots resident.
    const recordBase = octree.records.count + slot * octree.chunkCapacity;
    device.queue.writeBuffer(
      entry.recordsBuffer,
      recordBase * GPU_RECORD_BYTES,
      packStarGpuRecords(chunk.records),
    );
    cut.uploadChunk(source, slot, chunk, host);
    entry.slotChunks[slot] = chunk;
  }

  function evictChunk(source: SourceType, slot: number, hostSlot: number | null): void {
    const entry = sources.get(source);
    const chunk = entry?.slotChunks[slot] ?? null;
    if (entry === undefined || chunk === null) return;
    cut.evictChunk(source, slot, chunk, hostOf(entry, hostSlot));
    entry.slotChunks[slot] = null;
  }

  function snapshotPickSlots(): void {
    for (const entry of sources.values()) {
      entry.slotChunks.forEach((chunk, slot) => (entry.pickSlotChunks[slot] = chunk));
    }
  }

  function recordOrdinal(source: SourceType, poolIndex: number): number | null {
    const entry = sources.get(source);
    if (entry === undefined || !Number.isInteger(poolIndex) || poolIndex < 0) return null;
    const { octree } = entry;
    const indexRecords = octree.records.count;
    if (poolIndex < indexRecords) return poolIndex;
    const slot = Math.floor((poolIndex - indexRecords) / octree.chunkCapacity);
    const chunk = slot < entry.slots ? entry.pickSlotChunks[slot]! : null;
    if (chunk === null) return null;
    const local = poolIndex - indexRecords - slot * octree.chunkCapacity;
    return local < chunk.ref.records ? chunk.ref.recordBase + local : null;
  }

  function poolRecordIndex(source: SourceType, ordinal: number): number | null {
    const entry = sources.get(source);
    if (entry === undefined || !Number.isInteger(ordinal) || ordinal < 0) return null;
    const { octree } = entry;
    if (ordinal < octree.records.count) return ordinal;
    const slot = entry.slotChunks.findIndex(
      (c) =>
        c !== null && ordinal >= c.ref.recordBase && ordinal < c.ref.recordBase + c.ref.records,
    );
    if (slot < 0) return null;
    const local = ordinal - entry.slotChunks[slot]!.ref.recordBase;
    return octree.records.count + slot * octree.chunkCapacity + local;
  }

  function* loadedCatalogs(): IterableIterator<{ source: SourceType; octree: StarOctree }> {
    for (const [source, entry] of sources) {
      yield { source, octree: entry.octree };
    }
  }

  function drawCut(pass: GPURenderPassEncoder, args: StarCatalogCutDrawArgs): void {
    const entry = sources.get(args.source);
    if (args.capture && frameCut !== null) cut.submitCapture(frameCut);
    const cutDraw = cut.drawOf(args.source, args.stream, args.capture);
    if (!entry || cutDraw === null) return;

    // Identical bytes for every source within one view slot, so the repeated
    // write is idempotent. `pickPass` is never written, so the zero-init
    // scratch sends the vertex stage down the visual path.
    writeCameraPrefix(cameraScratch, args.vp, args.viewportPx, args.pxPerRad);
    cameraScratch[SIZE_PX_FLOAT_INDEX] = args.sizePx;
    cameraScratch[BRIGHTNESS_FLOAT_INDEX] = args.brightness;
    cameraScratch[GLOW_OVERLAP_FLOAT_INDEX] = args.glowOverlap;
    cameraScratch[AGG_INTENSITY_CAP_FLOAT_INDEX] = args.aggregateIntensityCap;
    cameraScratch[PX_PER_RAD_FLOAT_INDEX] = args.pxPerRad;
    writeStarFocus(cameraScratch, args.focus);
    const cameraRing = cameraRings[args.stream];
    cameraRing.writeSlot(args.viewSlot, cameraScratch);

    // Aggregates draw linear for `star-upsample` to knee; a capture face has no
    // upsample pass, so its aggregates take the knee'd pipeline.
    const knee = args.stream === 'leaf' || args.capture;
    pass.setPipeline(knee ? pipelines.kneed : pipelines.linear);
    pass.setBindGroup(0, cameraRing.bindGroupOf(args.viewSlot));
    pass.setBindGroup(1, cutDraw.bindGroup);
    pass.setBindGroup(2, entry.recordsBindGroup);
    pass.drawIndirect(cutDraw.indirect, cutDraw.indirectOffset);
  }

  function setFrameCut(next: StarCutInputs | null, recut: boolean): void {
    frameCut = next;
    frameRecut = recut;
  }

  function getFrameCut(): StarCutInputs | null {
    return frameCut;
  }

  function encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites): void {
    if (frameCut !== null) cut.encode(encoder, frameCut, frameRecut, claimTimestampWrites);
  }

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
    uploadChunk,
    evictChunk,
    snapshotPickSlots,
    recordOrdinal,
    poolRecordIndex,
    loadedCatalogs,
    drawCut,
    encodeCut,
    pickResources,
    setFrameCut,
    getFrameCut,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
