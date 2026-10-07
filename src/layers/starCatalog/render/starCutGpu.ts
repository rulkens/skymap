/**
 * starCutGpu — the per-frame octree cut as three compute dispatches: one small
 * uniform per source, then the GPU decides, fades and lists every node
 * (`cut.wesl`). Draws read the lists via `drawIndirect`; the cut's size never
 * reaches JS. Each state's buffers are sized once to the catalog's worst case
 * when built (live at upload, capture at the first capture). Nothing tells a
 * compute row a capture is scheduled, so the first capture face submits its cut
 * on its own encoder, queued ahead of the frame's.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCutGpu } from '../@types/StarCutGpu';
import type { StarCutState } from '../@types/StarCutState';
import type { StarCutSource } from '../@types/StarCutSource';
import type { StarCutInputs } from '../@types/StarCutInputs';
import type { StarCutSourceInput } from '../@types/StarCutSourceInput';
import type { StarCutDraw } from '../@types/StarCutDraw';
import type { StarCutVariant } from '../@types/StarCutVariant';
import type { StarDrawStream } from '../@types/StarDrawStream';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import cutCode from '../../../services/gpu/shaders/starCatalog/cut.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { NODE_FADE_MAX_DT_MS, NODE_FADE_MS } from '../../../data/starNodeFade';
import {
  AGG_DRAW_BYTE_OFFSET,
  CUT_DRAWS_WORDS,
  CUT_HIST_WORDS,
  CUT_STREAM_BYTES,
  CUT_UNIFORM_BYTES,
  CUT_WORKGROUP,
  LEAF_BLOCK_SHIFT,
  WORD_BYTES,
  initialCutDraws,
  leafListCapacity,
  packStarCutNodes,
  writeStarCutUniforms,
} from './starCutLayout';

const NO_PLANES = new Float32Array(0);

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

  // One per stream, shared by every source: the list's instances-per-entry.
  const streamShift = (shift: number): GPUBuffer => {
    const buffer = device.createBuffer({
      label: `star-cut-stream-shift-${shift}`,
      size: CUT_STREAM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const words = new Uint32Array(CUT_STREAM_BYTES / WORD_BYTES);
    words[0] = shift;
    device.queue.writeBuffer(buffer, 0, words);
    return buffer;
  };
  const streamShifts: Record<StarDrawStream, GPUBuffer> = {
    leaf: streamShift(LEAF_BLOCK_SHIFT),
    aggregate: streamShift(0),
  };

  const sources = new Map<SourceType, StarCutSource>();
  const uniformScratch = new ArrayBuffer(CUT_UNIFORM_BYTES);
  // The inputs whose capture cut is already submitted: six faces draw one cut.
  let capturedFor: StarCutInputs | null = null;

  function createState(label: string, catalog: StarCatalog, nodes: GPUBuffer): StarCutState {
    const make = (name: string, words: number, usage: number): GPUBuffer =>
      device.createBuffer({
        label: `star-cut-${name}-${label}`,
        size: Math.max(1, words) * WORD_BYTES,
        usage,
      });
    const nodeCount = catalog.nodes.length;
    const opacity = make('opacity', nodeCount, STORAGE);
    const leafList = make('leaf-list', leafListCapacity(catalog), STORAGE);
    const aggList = make('agg-list', nodeCount, STORAGE);
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
    entry.live.buffers.forEach((buffer) => buffer.destroy());
    entry.capture?.buffers.forEach((buffer) => buffer.destroy());
    sources.delete(source);
  }

  function upload(source: SourceType, catalog: StarCatalog): void {
    const packed = catalog.records.length === 0 ? null : packStarCutNodes(catalog);
    release(source);
    if (packed === null) return;
    const nodes = device.createBuffer({
      label: `star-cut-nodes-${source}`,
      size: packed.byteLength,
      usage: STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(nodes, 0, packed);
    sources.set(source, {
      catalog,
      nodes,
      live: createState(`${source}`, catalog, nodes),
      capture: null,
    });
  }

  /** Write one cut's uniforms and record its three dispatches into `pass`. */
  function dispatch(
    pass: GPUComputePassEncoder,
    catalog: StarCatalog,
    state: StarCutState,
    inputs: StarCutInputs,
    row: StarCutSourceInput,
    variant: StarCutVariant,
  ): void {
    const { cut } = inputs;
    writeStarCutUniforms(uniformScratch, catalog, cut.originMpc, {
      refineThreshold: cut.refineThreshold,
      fadeStep: variant.fadeStep,
      budgetTypical: row.budgetTypical,
      worldSpread: cut.worldSpread,
      leafMarginRad: cut.leafMarginRad,
      opacity: row.opacity,
      planes: variant.planes,
    });
    device.queue.writeBuffer(state.uniforms, 0, uniformScratch);
    state.lastMs = inputs.nowMs;

    const groups = Math.ceil(catalog.nodes.length / CUT_WORKGROUP);
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
      dispatch(pass, entry.catalog, entry.live, inputs, row, {
        fadeStep: Math.min(1, dtMs / NODE_FADE_MS),
        planes: inputs.cut.planes,
      });
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
      entry.capture ??= createState(`${row.source}-capture`, entry.catalog, entry.nodes);
      // No frustum (six faces see every direction) and no fade (one static frame).
      dispatch(pass, entry.catalog, entry.capture, inputs, row, {
        fadeStep: 1,
        planes: NO_PLANES,
      });
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

  const cutGpu: StarCutGpu = { drawBgl, upload, encode, submitCapture, drawOf, destroy };
  return cutGpu;
}
