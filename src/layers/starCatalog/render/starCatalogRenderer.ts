/**
 * starCatalogRenderer — the survey (Gaia bin) stars as additive point sprites in
 * the depthless HDR accumulation. Its own pipeline: records are two u32 each
 * (`packStarGpuRecords`), vertex-pulled and rebuilt against their node's box.
 * `upload` commits a catalog once; the per-frame cut is taken on the GPU
 * (`starCutGpu`) from the inputs `setFrameCut` holds, and each stream draws with
 * one `drawIndirect`. Leaves go to full-res HDR (`fs`), aggregates LINEAR to the
 * half-res `star-aggregates` offscreen (`fsLinear`); both are rgba16float.
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
import { GPU_RECORD_WORDS, packStarGpuRecords } from '../../../utils/star/packStarGpuRecords';
import { starRecordObject } from '../../../utils/star/starRecordObject';
import { starRecordOrdinal } from '../../../utils/star/starRecordOrdinal';
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
  /** The chunk ref each slot holds, −1 when empty: the pick's pool index ↔ ordinal map. */
  chunkOfSlot: Int32Array;
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

  function upload(source: SourceType, octree: StarOctree, slots: number): void {
    const poolSlots = Math.min(slots, octree.chunks.length);
    // Throws past a pool cap before anything below is created or released.
    cut.upload(source, octree, poolSlots);
    // Empty octree is the unload signal (a tier swap that drops the bin);
    // `createBuffer({size:0})` is forbidden.
    const packed = octree.records.count === 0 ? null : packStarGpuRecords(octree.records);
    // GPU buffers are fixed-size — destroy and reallocate on replace.
    sources.get(source)?.recordsBuffer.destroy();
    sources.delete(source);
    if (packed === null) return;

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
      chunkOfSlot: new Int32Array(poolSlots).fill(-1),
      recordsBuffer,
      recordsBindGroup,
    });
  }

  function uploadChunk(source: SourceType, slot: number, chunk: StarChunk): void {
    const entry = sources.get(source);
    if (entry === undefined || slot < 0 || slot >= entry.slots) {
      throw new Error(`starCatalogRenderer: no slot ${slot} for source ${source}`);
    }
    const { octree } = entry;
    // The records land before the cut marks the chunk's root resident.
    const recordBase = octree.records.count + slot * octree.chunkCapacity;
    device.queue.writeBuffer(
      entry.recordsBuffer,
      recordBase * GPU_RECORD_BYTES,
      packStarGpuRecords(chunk.records),
    );
    cut.uploadChunk(source, slot, chunk);
    entry.chunkOfSlot[slot] = chunk.ref;
  }

  function evictChunk(source: SourceType, slot: number): void {
    cut.evictChunk(source, slot);
    const entry = sources.get(source);
    if (entry !== undefined) entry.chunkOfSlot[slot] = -1;
  }

  function recordOrdinal(source: SourceType, poolIndex: number): number | null {
    const entry = sources.get(source);
    if (entry === undefined || !Number.isInteger(poolIndex) || poolIndex < 0) return null;
    const { octree } = entry;
    const indexRecords = octree.records.count;
    if (poolIndex < indexRecords) return poolIndex;
    const slot = Math.floor((poolIndex - indexRecords) / octree.chunkCapacity);
    const ref = slot < entry.slots ? entry.chunkOfSlot[slot]! : -1;
    if (ref < 0) return null;
    const local = poolIndex - indexRecords - slot * octree.chunkCapacity;
    return local < octree.chunks[ref]!.records ? starRecordOrdinal(octree, ref, local) : null;
  }

  function poolRecordIndex(source: SourceType, ordinal: number): number | null {
    const entry = sources.get(source);
    if (entry === undefined) return null;
    const at = starRecordObject(entry.octree, ordinal);
    if (at === null) return null;
    if (at.chunk === null) return at.local;
    const slot = entry.chunkOfSlot.indexOf(at.chunk);
    if (slot < 0) return null;
    return entry.octree.records.count + slot * entry.octree.chunkCapacity + at.local;
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

  function setFrameCut(next: StarCutInputs | null): void {
    frameCut = next;
  }

  function getFrameCut(): StarCutInputs | null {
    return frameCut;
  }

  function encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites): void {
    if (frameCut !== null) cut.encode(encoder, frameCut, claimTimestampWrites);
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
