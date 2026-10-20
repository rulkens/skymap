/**
 * galaxyPooledPointRenderer — an octree galaxy source as additive point billboards in the
 * galaxy points target, its blobs as box-filling glows through their own fragment (D9).
 * Records are six u32 each (`packGalaxyGpuRecords`), the index's first, then `slots × chunkCapacity`, vertex-pulled
 * through the shared GPU cut (`octreeCutGpu`, labelled 'galaxy-cut') into the same
 * `galaxyPointVertex` body the flat pipeline calls. `@group(2)` is per source and per view
 * slot: its fade buffer is written per view, before one submit (RENDERER.md landmine #1).
 */

import type { Mat4 } from 'wgpu-matrix';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyPointStats } from '../../../@types/engine/GalaxyPointStats';
import type { GalaxyPointDrawSettings } from '../../../@types/rendering/GalaxyPointDrawSettings';
import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeChunk } from '../../../@types/octree/OctreeChunk';
import type { OctreeChunkHost } from '../../../@types/octree/OctreeChunkHost';
import type { OctreeCutInputs } from '../../../@types/octree/OctreeCutInputs';
import type { OctreeDrawStream } from '../../../@types/octree/OctreeDrawStream';
import type { OctreePoolLayout } from '../../../@types/octree/OctreePoolLayout';
import type { PooledPickSourceDraw } from '../../../@types/rendering/PooledPickSourceDraw';
import type { GalaxyPooledPointRenderer } from '../@types/GalaxyPooledPointRenderer';
import type { LoadedPooledSource } from '../@types/LoadedPooledSource';
import vsCode from '../../../services/gpu/shaders/galaxyCatalog/points/pooledVertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/galaxyCatalog/points/pooledColorFragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { createOctreeCutGpu } from '../../../services/gpu/octree/octreeCutGpu';
import { WORD_BYTES } from '../../../services/gpu/octree/octreeCutLayout';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { GALAXY_OCTREE_FAMILY } from '../../../data/octree/galaxyOctreeFamily';
import { SOURCE_REGISTRY } from '../../../data/sources';
import { GALAXY_GPU_RECORD_WORDS } from '../../../data/galaxyCatalog/galaxyGpuRecordWords';
import { GALAXY_BLOB_GLOW_OVERLAP } from '../../../data/galaxyCatalog/galaxyBlobGlowOverlap';
import { GALAXY_BLOB_PEAK_CAP } from '../../../data/galaxyCatalog/galaxyBlobPeakCap';
import {
  createViewSlotUniformRing,
  VIEW_SLOT_COUNT,
} from '../../../utils/gpu/createViewSlotUniformRing';
import { packGalaxyGpuRecords } from '../../../utils/galaxy/packGalaxyGpuRecords';
import { recordOrdinal } from '../../../utils/octree/recordOrdinal';
import { poolRecordIndex } from '../../../utils/octree/poolRecordIndex';
import { packGalaxyPointUniforms } from './packGalaxyPointUniforms';
import { UNIFORM_BYTES } from './galaxyPointVertexLayout';

const RECORD_BYTES = GALAXY_GPU_RECORD_WORDS * WORD_BYTES;
/** `SourceUniforms` (lib/sourceUniforms.wesl), `FadeUniforms` and `PooledRecordUniforms` (pooledVertex.wesl). */
const SOURCE_UNIFORM_BYTES = 16;
const FADE_UNIFORM_BYTES = 16;
const POOLED_UNIFORM_BYTES = 32;
const POOLED_ABS_MAG_Q0_INDEX = 3;
const POOLED_ABS_MAG_Q1_INDEX = 4;
const POOLED_BLOB_OVERLAP_INDEX = 5;
const POOLED_BLOB_PEAK_CAP_INDEX = 6;
const FIXED_STEP_COLUMNS = ['colourIndex', 'axisRatio'] as const;
const STREAMS: readonly OctreeDrawStream[] = ['leaf', 'aggregate'];

export function createGalaxyPooledPointRenderer(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
  focusBgl: FocusUniformsBgl;
}): GalaxyPooledPointRenderer {
  const { device, targetFormat, focusBgl } = init;
  const cut = createOctreeCutGpu(device, 'galaxy-cut');
  let frameCut: OctreeCutInputs | null = null;
  let frameRecut = true;

  const uniformsBgl = device.createBindGroupLayout({
    label: 'galaxy-pooled-points-bgl-group0',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const recordsBgl = device.createBindGroupLayout({
    label: 'galaxy-pooled-points-records-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  // One layout for both streams' pipelines, so the bind groups set once survive the switch.
  const layout = device.createPipelineLayout({
    label: 'galaxy-pooled-points-pipeline-layout',
    bindGroupLayouts: [uniformsBgl, cut.drawBgl, recordsBgl, focusBgl],
  });
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'points.pooledVertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'points.pooledColorFragment');
  const pipelineOf = (stream: OctreeDrawStream, entryPoint: string): GPURenderPipeline =>
    device.createRenderPipeline({
      label: `galaxy-pooled-points-pipeline-${stream}`,
      layout,
      // Records are vertex-pulled: no vertex buffers.
      vertex: { module: vsModule, entryPoint: 'vs' },
      fragment: {
        module: fsModule,
        entryPoint,
        targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
    });
  const pipelines: Readonly<Record<OctreeDrawStream, GPURenderPipeline>> = {
    leaf: pipelineOf('leaf', 'fs'),
    aggregate: pipelineOf('aggregate', 'fsBlob'),
  };
  const uniformRing = createViewSlotUniformRing({
    device,
    label: 'galaxy-pooled-points-uniform',
    byteSize: UNIFORM_BYTES,
    layout: uniformsBgl,
  });
  const fadeScratch = new Float32Array(FADE_UNIFORM_BYTES / 4);

  const sources = new Map<SourceType, LoadedPooledSource>();

  function freeBuffers(source: SourceType): void {
    sources.get(source)?.buffers.forEach((b) => b.destroy());
    sources.delete(source);
  }

  function uniformBuffer(label: string, size: number): GPUBuffer {
    return device.createBuffer({
      label,
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  function upload(
    source: SourceType,
    octree: Octree<GalaxyColumns>,
    slots: number,
    stats: GalaxyPointStats,
  ): number {
    const poolSlots = Math.min(slots, octree.chunkCount);
    // Throws past a pool cap before anything below is created or released.
    cut.upload(source, octree, poolSlots);
    freeBuffers(source);
    const indexRecords = octree.records.count;
    // `createBuffer({size:0})` is forbidden; a degenerate index leaves nothing to draw.
    if (indexRecords + poolSlots * octree.chunkCapacity === 0) return poolSlots;

    const packed = new Uint32Array(indexRecords * GALAXY_GPU_RECORD_WORDS);
    packGalaxyGpuRecords(octree, octree, stats, packed, 0);
    const recordsBuffer = device.createBuffer({
      label: `galaxy-pooled-records-${source}`,
      size: (indexRecords + poolSlots * octree.chunkCapacity) * RECORD_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(recordsBuffer, 0, packed);

    const entry = SOURCE_REGISTRY[source];
    const sourceBuffer = uniformBuffer(`galaxy-pooled-source-${source}`, SOURCE_UNIFORM_BYTES);
    const sourceWords = new ArrayBuffer(SOURCE_UNIFORM_BYTES);
    new Uint32Array(sourceWords)[0] = source;
    if (entry.type === 'galaxyCatalog') {
      new Float32Array(sourceWords).set([entry.sbBoost, entry.falloffHalfMpc], 1);
    }
    device.queue.writeBuffer(sourceBuffer, 0, sourceWords);

    const absMag = octree.columns.find((c) => c.id === 'absMag');
    if (absMag === undefined) throw new Error('galaxyPooledPointRenderer: schema lacks absMag');
    // pooledVertex.wesl hardcodes these two steps (q0 = 0) from the default schema.
    for (const id of FIXED_STEP_COLUMNS) {
      const got = octree.columns.find((c) => c.id === id);
      const want = GALAXY_OCTREE_FAMILY.schema.find((c) => c.id === id)!;
      if (got?.q0 !== want.q0 || got.q1 !== want.q1) {
        throw new Error(`galaxyPooledPointRenderer: header overrides the ${id} decode step`);
      }
    }
    const pooledBuffer = uniformBuffer(`galaxy-pooled-uniform-${source}`, POOLED_UNIFORM_BYTES);
    const pooledWords = new Float32Array(POOLED_UNIFORM_BYTES / 4);
    pooledWords.set(
      octree.grid.origin.map((v) => v * GALAXY_OCTREE_FAMILY.unitMpc),
      0,
    );
    pooledWords[POOLED_ABS_MAG_Q0_INDEX] = absMag.q0;
    pooledWords[POOLED_ABS_MAG_Q1_INDEX] = absMag.q1;
    pooledWords[POOLED_BLOB_OVERLAP_INDEX] = GALAXY_BLOB_GLOW_OVERLAP;
    pooledWords[POOLED_BLOB_PEAK_CAP_INDEX] = GALAXY_BLOB_PEAK_CAP;
    device.queue.writeBuffer(pooledBuffer, 0, pooledWords);

    const fadeBuffers = Array.from({ length: VIEW_SLOT_COUNT }, (_, slot) =>
      uniformBuffer(`galaxy-pooled-fade-${source}-slot${slot}`, FADE_UNIFORM_BYTES),
    );
    const bindGroups = fadeBuffers.map((fade, slot) =>
      device.createBindGroup({
        label: `galaxy-pooled-records-bg-${source}-slot${slot}`,
        layout: recordsBgl,
        entries: [
          { binding: 0, resource: { buffer: recordsBuffer } },
          { binding: 1, resource: { buffer: sourceBuffer } },
          { binding: 2, resource: { buffer: pooledBuffer } },
          { binding: 3, resource: { buffer: fade } },
        ],
      }),
    );
    sources.set(source, {
      octree,
      slots: poolSlots,
      stats,
      slotChunks: new Array<OctreeChunk<GalaxyColumns> | null>(poolSlots).fill(null),
      pickSlotChunks: new Array<OctreeChunk<GalaxyColumns> | null>(poolSlots).fill(null),
      buffers: [recordsBuffer, sourceBuffer, pooledBuffer, ...fadeBuffers],
      recordsBuffer,
      fadeBuffers,
      bindGroups,
    });
    return poolSlots;
  }

  function unload(source: SourceType): void {
    const entry = sources.get(source);
    if (entry === undefined) return;
    // An octree with no records is the cut's release.
    cut.upload(source, { ...entry.octree, records: { count: 0 } }, 0);
    freeBuffers(source);
  }

  function hostOf(
    { octree, slotChunks }: LoadedPooledSource,
    hostSlot: number | null,
  ): OctreeChunkHost {
    if (hostSlot === null) return { nodes: octree.nodes, nodeBase: 0 };
    return {
      nodes: slotChunks[hostSlot]!.nodes,
      nodeBase: octree.nodes.count + hostSlot * octree.chunkNodeCap,
    };
  }

  function uploadChunk(
    source: SourceType,
    slot: number,
    chunk: OctreeChunk<GalaxyColumns>,
    hostSlot: number | null,
  ): void {
    const entry = sources.get(source);
    if (entry === undefined || slot < 0 || slot >= entry.slots) {
      throw new Error(`galaxyPooledPointRenderer: no slot ${slot} for source ${source}`);
    }
    const { octree, stats } = entry;
    const packed = new Uint32Array(chunk.records.count * GALAXY_GPU_RECORD_WORDS);
    packGalaxyGpuRecords(chunk, octree, stats, packed, 0);
    // The records land before the cut marks the chunk's roots resident.
    const recordBase = octree.records.count + slot * octree.chunkCapacity;
    device.queue.writeBuffer(entry.recordsBuffer, recordBase * RECORD_BYTES, packed);
    cut.uploadChunk(source, slot, chunk, hostOf(entry, hostSlot));
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

  const refsOf = (chunks: readonly (OctreeChunk<GalaxyColumns> | null)[]) =>
    chunks.map((chunk) => chunk?.ref ?? null);
  const layoutOf = ({ octree, slots }: LoadedPooledSource): OctreePoolLayout => ({
    indexRecords: octree.records.count,
    chunkCapacity: octree.chunkCapacity,
    slots,
  });

  function recordOrdinalOf(source: SourceType, poolIndex: number): number | null {
    const entry = sources.get(source);
    if (entry === undefined || !Number.isInteger(poolIndex) || poolIndex < 0) return null;
    return recordOrdinal(layoutOf(entry), refsOf(entry.pickSlotChunks), poolIndex);
  }

  function poolRecordIndexOf(source: SourceType, ordinal: number): number | null {
    const entry = sources.get(source);
    if (entry === undefined || !Number.isInteger(ordinal) || ordinal < 0) return null;
    return poolRecordIndex(layoutOf(entry), refsOf(entry.slotChunks), ordinal);
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    settings: GalaxyPointDrawSettings,
    capture: boolean,
  ): void {
    if (frameCut === null) return;
    if (capture) cut.submitCapture(frameCut);
    const { viewSlot } = settings;
    let bound = false;
    for (const { source } of frameCut.cut.sources) {
      const entry = sources.get(source);
      const opacity = settings.fadeOpacityOf(source);
      if (entry === undefined || opacity === 0) continue;
      if (!bound) {
        uniformRing.writeSlot(viewSlot, packGalaxyPointUniforms(viewProj, viewportPx, settings));
        pass.setBindGroup(0, uniformRing.bindGroupOf(viewSlot));
        pass.setBindGroup(3, settings.focusBindGroup);
        bound = true;
      }
      fadeScratch[0] = opacity;
      device.queue.writeBuffer(entry.fadeBuffers[viewSlot]!, 0, fadeScratch);
      pass.setBindGroup(2, entry.bindGroups[viewSlot]!);
      for (const stream of STREAMS) {
        const cutDraw = cut.drawOf(source, stream, capture);
        if (cutDraw === null) continue;
        pass.setPipeline(pipelines[stream]);
        pass.setBindGroup(1, cutDraw.bindGroup);
        pass.drawIndirect(cutDraw.indirect, cutDraw.indirectOffset);
      }
    }
  }

  function pickDraws(include: (source: SourceType) => boolean): PooledPickSourceDraw[] {
    if (frameCut === null) return [];
    return frameCut.cut.sources.flatMap(({ source }) => {
      const entry = sources.get(source);
      const leaf = cut.drawOf(source, 'leaf', false);
      if (entry === undefined || leaf === null || !include(source)) return [];
      return [{ source, cut: leaf, recordsBindGroup: entry.bindGroups[0]! }];
    });
  }

  function destroy(): void {
    for (const source of [...sources.keys()]) freeBuffers(source);
    cut.destroy();
    uniformRing.destroy();
  }

  const renderer: GalaxyPooledPointRenderer = {
    label: 'galaxyPooledPointRenderer',
    pickLayouts: { drawBgl: cut.drawBgl, recordsBgl },
    upload,
    unload,
    uploadChunk,
    evictChunk,
    snapshotPickSlots,
    recordOrdinal: recordOrdinalOf,
    poolRecordIndex: poolRecordIndexOf,
    setFrameCut(inputs, recut) {
      frameCut = inputs;
      frameRecut = recut;
    },
    encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites) {
      if (frameCut !== null) cut.encode(encoder, frameCut, frameRecut, claimTimestampWrites);
    },
    draw,
    pickDraws,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
