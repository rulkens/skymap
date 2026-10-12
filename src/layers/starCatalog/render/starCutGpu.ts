/**
 * starCutGpu — the per-frame octree cut as three compute dispatches: one small
 * uniform per source, then the GPU decides, fades and lists every node
 * (`cut.wesl`). Draws read the lists via `drawIndirect`; the cut's size never
 * reaches JS. Each state's buffers are sized once to the octree's worst case
 * when built (live at upload, capture at the first capture). Nothing tells a
 * compute row a capture is scheduled, so the first capture face submits its cut
 * on its own encoder, queued ahead of the frame's.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { StarCutGpu } from '../@types/StarCutGpu';
import type { StarCutState } from '../@types/StarCutState';
import type { StarCutSource } from '../@types/StarCutSource';
import type { StarCutInputs } from '../@types/StarCutInputs';
import type { StarCutSourceInput } from '../@types/StarCutSourceInput';
import type { StarCutDraw } from '../@types/StarCutDraw';
import type { StarDrawStream } from '../@types/StarDrawStream';
import type { StarChunkHost } from '../@types/StarChunkHost';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import cutCode from '../../../services/gpu/shaders/starCatalog/cut.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { NODE_FADE_MAX_DT_MS, NODE_FADE_MS } from '../../../data/starNodeFade';
import {
  AGG_DRAW_BYTE_OFFSET,
  CUT_DRAWS_WORDS,
  CUT_HIST_WORDS,
  CUT_NODE_WORDS,
  NODE_BITS_WORD,
  NODE_REFINE_DELTA_WORD,
  checkStarPoolCaps,
  chunkRootRefineDeltas,
  packStarChunkNodes,
  CUT_STREAM_BYTES,
  CUT_UNIFORM_BYTES,
  CUT_WORKGROUP,
  LEAF_BLOCK_SHIFT,
  OPACITY_CHANNELS,
  STREAM_BLOCK_SHIFT_WORD,
  STREAM_IS_BLOB_WORD,
  WORD_BYTES,
  initialCutDraws,
  leafListCapacity,
  packStarCutNodes,
  writeChunkRootWords,
  writeStarCutUniforms,
} from './starCutLayout';

const NO_PLANES = new Float32Array(0);

function poolRows(octree: StarOctree, slots: number): number {
  return octree.nodes.count + slots * octree.chunkNodeCap;
}

export function createStarCutGpu(device: GPUDevice): StarCutGpu {
  const STORAGE = GPUBufferUsage.STORAGE;

  const module = createShaderModuleWithDevLog(device, cutCode, 'starCatalog.cut');

  const bufferEntry = (
    binding: number,
    visibility: GPUShaderStageFlags,
    type: GPUBufferBindingType,
  ): GPUBindGroupLayoutEntry => ({ binding, visibility, buffer: { type } });
  const computeEntry = (binding: number, type: GPUBufferBindingType) =>
    bufferEntry(binding, GPUShaderStage.COMPUTE, type);
  const drawEntry = (binding: number, type: GPUBufferBindingType) =>
    bufferEntry(binding, GPUShaderStage.VERTEX, type);
  const computeBgl = device.createBindGroupLayout({
    label: 'star-cut-compute-bgl',
    entries: [
      computeEntry(0, 'uniform'),
      computeEntry(1, 'read-only-storage'),
      computeEntry(2, 'storage'),
      computeEntry(3, 'storage'),
      computeEntry(4, 'storage'),
      computeEntry(5, 'storage'),
      computeEntry(6, 'storage'),
      computeEntry(7, 'read-only-storage'),
    ],
  });
  const drawBgl = device.createBindGroupLayout({
    label: 'star-cut-draw-bgl',
    entries: [
      drawEntry(0, 'uniform'),
      drawEntry(1, 'read-only-storage'),
      drawEntry(2, 'read-only-storage'),
      drawEntry(3, 'read-only-storage'),
      drawEntry(4, 'uniform'),
    ],
  });
  const layout = device.createPipelineLayout({
    label: 'star-cut-pipeline-layout',
    bindGroupLayouts: [computeBgl],
  });
  const pipeline = (entryPoint: string): GPUComputePipeline =>
    device.createComputePipeline({
      label: `star-cut-${entryPoint}`,
      layout,
      compute: { module, entryPoint },
    });
  const histogram = pipeline('histogram');
  const pickThreshold = pipeline('pickThreshold');
  const emit = pipeline('emit');

  // One per stream, shared by every source: the list's instances-per-entry and
  // whether it draws blobs.
  const streamUniform = (stream: StarDrawStream, shift: number, isBlob: boolean): GPUBuffer => {
    const buffer = device.createBuffer({
      label: `star-cut-stream-${stream}`,
      size: CUT_STREAM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const words = new Uint32Array(CUT_STREAM_BYTES / WORD_BYTES);
    words[STREAM_BLOCK_SHIFT_WORD] = shift;
    words[STREAM_IS_BLOB_WORD] = isBlob ? 1 : 0;
    device.queue.writeBuffer(buffer, 0, words);
    return buffer;
  };
  const streamShifts: Record<StarDrawStream, GPUBuffer> = {
    leaf: streamUniform('leaf', LEAF_BLOCK_SHIFT, false),
    aggregate: streamUniform('aggregate', 0, true),
  };

  const sources = new Map<SourceType, StarCutSource>();
  const uniformScratch = new ArrayBuffer(CUT_UNIFORM_BYTES);
  // writeBuffer copies at the call, so landings and evictions reuse these instead of allocating.
  const rootWordsScratch = new Uint32Array(2);
  const slotRowsScratch = new Uint32Array(1);
  let zeroOpacity = new Float32Array(0);
  // The inputs whose capture cut is already submitted: six faces draw one cut.
  let capturedFor: StarCutInputs | null = null;

  function createState(
    label: string,
    octree: StarOctree,
    slots: number,
    nodes: GPUBuffer,
    slotRows: GPUBuffer,
  ): StarCutState {
    const make = (name: string, words: number, usage: number): GPUBuffer =>
      device.createBuffer({
        label: `star-cut-${name}-${label}`,
        size: Math.max(1, words) * WORD_BYTES,
        usage,
      });
    const rows = poolRows(octree, slots);
    const opacity = make('opacity', rows * OPACITY_CHANNELS, STORAGE | GPUBufferUsage.COPY_DST);
    const leafList = make('leaf-list', leafListCapacity(octree, slots), STORAGE);
    const aggList = make('agg-list', rows, STORAGE);
    const draws = make(
      'draws',
      CUT_DRAWS_WORDS,
      STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    );
    device.queue.writeBuffer(draws, 0, initialCutDraws());
    const hist = make('hist', CUT_HIST_WORDS, STORAGE);
    const uniforms = device.createBuffer({
      label: `star-cut-uniforms-${label}`,
      size: CUT_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bind = (binding: number, buffer: GPUBuffer): GPUBindGroupEntry => ({
      binding,
      resource: { buffer },
    });
    const drawBindGroup = (stream: StarDrawStream, list: GPUBuffer): GPUBindGroup =>
      device.createBindGroup({
        label: `star-cut-draw-bg-${stream}-${label}`,
        layout: drawBgl,
        entries: [
          bind(0, uniforms),
          bind(1, nodes),
          bind(2, opacity),
          bind(3, list),
          bind(4, streamShifts[stream]),
        ],
      });
    return {
      buffers: [opacity, leafList, aggList, draws, hist, uniforms],
      uniforms,
      opacity,
      draws,
      computeBindGroup: device.createBindGroup({
        label: `star-cut-compute-bg-${label}`,
        layout: computeBgl,
        entries: [
          bind(0, uniforms),
          bind(1, nodes),
          bind(2, opacity),
          bind(3, leafList),
          bind(4, aggList),
          bind(5, draws),
          bind(6, hist),
          bind(7, slotRows),
        ],
      }),
      drawBindGroups: {
        leaf: drawBindGroup('leaf', leafList),
        aggregate: drawBindGroup('aggregate', aggList),
      },
      lastMs: null,
    };
  }

  function release(source: SourceType): void {
    const entry = sources.get(source);
    if (entry === undefined) return;
    entry.nodes.destroy();
    entry.slotRows.destroy();
    entry.live.buffers.forEach((buffer) => buffer.destroy());
    entry.capture?.buffers.forEach((buffer) => buffer.destroy());
    sources.delete(source);
  }

  function upload(source: SourceType, octree: StarOctree, slots: number): void {
    if (octree.records.count > 0) checkStarPoolCaps(octree, slots);
    const packed = octree.records.count === 0 ? null : packStarCutNodes(octree);
    release(source);
    if (packed === null) return;
    const nodes = device.createBuffer({
      label: `star-cut-nodes-${source}`,
      size: poolRows(octree, slots) * CUT_NODE_WORDS * WORD_BYTES,
      usage: STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(nodes, 0, packed);
    const slotRows = device.createBuffer({
      label: `star-cut-slot-rows-${source}`,
      size: Math.max(1, slots) * WORD_BYTES,
      usage: STORAGE | GPUBufferUsage.COPY_DST,
    });
    sources.set(source, {
      octree,
      slots,
      nodes,
      slotRows,
      live: createState(`${source}`, octree, slots, nodes, slotRows),
      capture: null,
    });
  }

  function slotOf(source: SourceType, slot: number): StarCutSource {
    const entry = sources.get(source);
    if (entry === undefined || slot < 0 || slot >= entry.slots) {
      throw new Error(`starCut: no slot ${slot} for source ${source}`);
    }
    return entry;
  }

  /** A root's two residency words in its host's rows: as packed, or with its chunk resident. */
  function writeRootWords(
    entry: StarCutSource,
    host: StarChunkHost,
    row: number,
    refineDelta: number | null,
  ): void {
    writeChunkRootWords(rootWordsScratch, host.nodes, row, refineDelta);
    const at = (host.nodeBase + row) * CUT_NODE_WORDS;
    const { queue } = device;
    queue.writeBuffer(entry.nodes, (at + NODE_BITS_WORD) * WORD_BYTES, rootWordsScratch, 0, 1);
    queue.writeBuffer(
      entry.nodes,
      (at + NODE_REFINE_DELTA_WORD) * WORD_BYTES,
      rootWordsScratch,
      1,
      1,
    );
  }

  function uploadChunk(
    source: SourceType,
    slot: number,
    chunk: StarChunk,
    host: StarChunkHost,
  ): void {
    const entry = slotOf(source, slot);
    const { octree } = entry;
    const roots = chunk.ref.roots.map((row) => ({
      level: host.nodes.level[row]!,
      morton: host.nodes.morton[row]!,
      rootRow: host.nodeBase + row,
    }));
    const nodeBase = octree.nodes.count + slot * octree.chunkNodeCap;
    const rows = packStarChunkNodes(
      chunk,
      roots,
      { nodeBase, recordBase: octree.records.count + slot * octree.chunkCapacity },
      octree.chunkNodeCap,
    );
    // Rows and fades first, every root's resident bit last: no frame refines a
    // root over another chunk's rows.
    device.queue.writeBuffer(entry.nodes, nodeBase * CUT_NODE_WORDS * WORD_BYTES, rows);
    writeSlotRows(entry, slot, chunk.nodes.count);
    const opacityWords = octree.chunkNodeCap * OPACITY_CHANNELS;
    if (zeroOpacity.length < opacityWords) zeroOpacity = new Float32Array(opacityWords);
    const zeros = zeroOpacity.subarray(0, opacityWords);
    for (const state of [entry.live, entry.capture]) {
      if (state === null) continue;
      device.queue.writeBuffer(state.opacity, nodeBase * OPACITY_CHANNELS * WORD_BYTES, zeros);
    }
    const deltas = chunkRootRefineDeltas(chunk, roots);
    chunk.ref.roots.forEach((row, k) => writeRootWords(entry, host, row, deltas[k]!));
  }

  function evictChunk(
    source: SourceType,
    slot: number,
    chunk: StarChunk,
    host: StarChunkHost,
  ): void {
    const entry = slotOf(source, slot);
    // Every root stops refining before its rows go; a landing rewrites every row of the slot.
    for (const row of chunk.ref.roots) writeRootWords(entry, host, row, null);
    writeSlotRows(entry, slot, 0);
  }

  function writeSlotRows(entry: StarCutSource, slot: number, rows: number): void {
    slotRowsScratch[0] = rows;
    device.queue.writeBuffer(entry.slotRows, slot * WORD_BYTES, slotRowsScratch);
  }

  /** Write one cut's uniforms and record its three dispatches into `pass`. */
  function dispatch(
    pass: GPUComputePassEncoder,
    { octree, slots }: StarCutSource,
    state: StarCutState,
    inputs: StarCutInputs,
    row: StarCutSourceInput,
    fadeStep: number,
    planes: Float32Array,
  ): void {
    const { cut } = inputs;
    writeStarCutUniforms(uniformScratch, octree, { slots }, cut.originMpc, {
      refineThreshold: cut.refineThreshold,
      fadeStep,
      drawBudget: row.drawBudget,
      worldSpread: cut.worldSpread,
      leafMarginRad: cut.leafMarginRad,
      opacity: row.opacity,
      planes,
    });
    device.queue.writeBuffer(state.uniforms, 0, uniformScratch);
    state.lastMs = inputs.nowMs;

    const groups = Math.ceil(poolRows(octree, slots) / CUT_WORKGROUP);
    pass.setBindGroup(0, state.computeBindGroup);
    pass.setPipeline(histogram);
    pass.dispatchWorkgroups(groups);
    pass.setPipeline(pickThreshold);
    pass.dispatchWorkgroups(1);
    pass.setPipeline(emit);
    pass.dispatchWorkgroups(groups);
  }

  function cutSources(inputs: StarCutInputs) {
    return inputs.cut.sources.flatMap((row) => {
      const entry = sources.get(row.source);
      return entry === undefined ? [] : [{ row, entry }];
    });
  }

  function encode(
    encoder: GPUCommandEncoder,
    inputs: StarCutInputs,
    claimTimestampWrites: ClaimTimestampWrites,
  ): void {
    const present = cutSources(inputs);
    if (present.length === 0) return;
    const pass = encoder.beginComputePass({ label: 'star-cut', ...claimTimestampWrites() });
    for (const { row, entry } of present) {
      const { lastMs } = entry.live;
      const dtMs =
        lastMs === null || inputs.nowMs < lastMs
          ? Infinity
          : Math.min(inputs.nowMs - lastMs, NODE_FADE_MAX_DT_MS);
      dispatch(
        pass,
        entry,
        entry.live,
        inputs,
        row,
        Math.min(1, dtMs / NODE_FADE_MS),
        inputs.cut.planes,
      );
    }
    pass.end();
  }

  function submitCapture(inputs: StarCutInputs): void {
    if (capturedFor === inputs) return;
    capturedFor = inputs;
    const present = cutSources(inputs);
    if (present.length === 0) return;
    const encoder = device.createCommandEncoder({ label: 'star-cut-capture' });
    const pass = encoder.beginComputePass({ label: 'star-cut-capture' });
    for (const { row, entry } of present) {
      entry.capture ??= createState(
        `${row.source}-capture`,
        entry.octree,
        entry.slots,
        entry.nodes,
        entry.slotRows,
      );
      // No frustum (six faces see every direction) and no fade (one static frame).
      dispatch(pass, entry, entry.capture, inputs, row, 1, NO_PLANES);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function drawOf(
    source: SourceType,
    stream: StarDrawStream,
    capture: boolean,
  ): StarCutDraw | null {
    const entry = sources.get(source);
    const state = capture ? entry?.capture : entry?.live;
    if (state === undefined || state === null || state.lastMs === null) return null;
    return {
      bindGroup: state.drawBindGroups[stream],
      indirect: state.draws,
      indirectOffset: stream === 'leaf' ? 0 : AGG_DRAW_BYTE_OFFSET,
    };
  }

  function destroy(): void {
    for (const source of [...sources.keys()]) release(source);
    streamShifts.leaf.destroy();
    streamShifts.aggregate.destroy();
  }

  const cutGpu: StarCutGpu = {
    drawBgl,
    upload,
    uploadChunk,
    evictChunk,
    encode,
    submitCapture,
    drawOf,
    destroy,
  };
  return cutGpu;
}
