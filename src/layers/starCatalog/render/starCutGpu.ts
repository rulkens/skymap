/**
 * starCutGpu — the per-frame octree cut as three compute dispatches instead of
 * a main-thread tree walk: the CPU writes one small uniform per source and the
 * GPU decides, fades and lists every node (`cut.wesl` explains the scheme).
 * The draw then reads the lists through `drawIndirect`, so the cut's size
 * never crosses back to JS.
 *
 * Every buffer is sized once at upload, to the catalog's worst case, so the
 * bind groups are built once too.
 *
 * A sky-cubemap capture needs a second cut of the same tree — every direction,
 * no fade — and nothing tells a compute row that a capture is scheduled. So
 * the first capture face to draw submits that cut on its own encoder: queued
 * ahead of the frame's encoder, it runs before the faces that read it.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCutGpu } from '../@types/StarCutGpu';
import type { StarCutState } from '../@types/StarCutState';
import type { StarCutSource } from '../@types/StarCutSource';
import type { StarCutFrame } from '../@types/StarCutFrame';
import cutCode from '../../../services/gpu/shaders/starCatalog/cut.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { NODE_FADE_MS } from '../../../data/starNodeFade';
import {
  AGG_DRAW_BYTE_OFFSET,
  CUT_DRAWS_WORDS,
  CUT_HIST_WORDS,
  CUT_UNIFORM_BYTES,
  CUT_WORKGROUP,
  LEAF_BLOCK_SHIFT,
  leafListCapacity,
  packStarCutNodes,
  writeStarCutUniforms,
} from './starCutLayout';

export function createStarCutGpu(device: GPUDevice): StarCutGpu {
  const storage = (binding: number, type: GPUBufferBindingType): GPUBindGroupLayoutEntry => ({
    binding,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type },
  });
  const computeBgl = device.createBindGroupLayout({
    label: 'star-cut-compute-bgl',
    entries: [
      storage(0, 'uniform'),
      storage(1, 'read-only-storage'),
      storage(2, 'storage'),
      storage(3, 'storage'),
      storage(4, 'storage'),
      storage(5, 'storage'),
      storage(6, 'storage'),
    ],
  });
  const vertex = (binding: number, type: GPUBufferBindingType): GPUBindGroupLayoutEntry => ({
    binding,
    visibility: GPUShaderStage.VERTEX,
    buffer: { type },
  });
  const drawBgl = device.createBindGroupLayout({
    label: 'star-cut-draw-bgl',
    entries: [
      vertex(0, 'uniform'),
      vertex(1, 'read-only-storage'),
      vertex(2, 'read-only-storage'),
      vertex(3, 'read-only-storage'),
      vertex(4, 'uniform'),
    ],
  });

  const module = createShaderModuleWithDevLog(device, cutCode, 'starCatalog.cut');
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
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, new Uint32Array([shift, 0, 0, 0]));
    return buffer;
  };
  const leafShift = streamShift(LEAF_BLOCK_SHIFT);
  const aggShift = streamShift(0);

  const sources = new Map<SourceType, StarCutSource>();
  const uniformScratch = new ArrayBuffer(CUT_UNIFORM_BYTES);

  function release(source: SourceType): void {
    const entry = sources.get(source);
    if (entry === undefined) return;
    entry.nodes.destroy();
    entry.frame.buffers.forEach((buffer) => buffer.destroy());
    entry.capture?.buffers.forEach((buffer) => buffer.destroy());
    sources.delete(source);
  }

  const STORAGE = GPUBufferUsage.STORAGE;

  function createState(label: string, catalog: StarCatalog, nodes: GPUBuffer): StarCutState {
    const make = (name: string, words: number, usage: number): GPUBuffer =>
      device.createBuffer({
        label: `star-cut-${name}-${label}`,
        size: Math.max(1, words) * 4,
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
    // Three vertices per billboard; `pickThreshold` zeroes the instance counts.
    device.queue.writeBuffer(draws, 0, new Uint32Array([3, 0, 0, 0, 3, 0, 0, 0]));
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
    const drawBindGroup = (list: GPUBuffer, shift: GPUBuffer): GPUBindGroup =>
      device.createBindGroup({
        label: `star-cut-draw-bg-${label}`,
        layout: drawBgl,
        entries: [
          bind(0, uniforms),
          bind(1, nodes),
          bind(2, opacity),
          bind(3, list),
          bind(4, shift),
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
        leaf: drawBindGroup(leafList, leafShift),
        aggregate: drawBindGroup(aggList, aggShift),
      },
      lastMs: null,
    };
  }

  function upload(source: SourceType, catalog: StarCatalog): void {
    release(source);
    if (catalog.records.length === 0) return;
    const packed = packStarCutNodes(catalog);
    const nodes = device.createBuffer({
      label: `star-cut-nodes-${source}`,
      size: packed.byteLength,
      usage: STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(nodes, 0, packed);
    sources.set(source, {
      catalog,
      nodes,
      frame: createState(`${source}`, catalog, nodes),
      capture: null,
    });
  }

  /** Write one cut's uniforms and record its three dispatches into `pass`. */
  function dispatch(
    pass: GPUComputePassEncoder,
    catalog: StarCatalog,
    state: StarCutState,
    frame: StarCutFrame,
    row: StarCutFrame['sources'][number],
    view: { readonly fadeStep: number; readonly viewCount: number },
  ): void {
    writeStarCutUniforms(uniformScratch, catalog, frame.originMpc, {
      refineThreshold: frame.refineThreshold,
      fadeStep: view.fadeStep,
      budgetTypical: row.budgetTypical,
      worldSpread: frame.worldSpread,
      leafMarginRad: frame.leafMarginRad,
      opacity: row.opacity,
      planes: frame.planes,
      viewCount: view.viewCount,
    });
    device.queue.writeBuffer(state.uniforms, 0, uniformScratch);
    state.lastMs = frame.nowMs;

    const groups = Math.ceil(catalog.nodes.length / CUT_WORKGROUP);
    pass.setBindGroup(0, state.computeBindGroup);
    pass.setPipeline(histogram);
    pass.dispatchWorkgroups(groups);
    pass.setPipeline(pickThreshold);
    pass.dispatchWorkgroups(1);
    pass.setPipeline(emit);
    pass.dispatchWorkgroups(groups);
  }

  const liveSources = (frame: StarCutFrame) =>
    frame.sources.flatMap((row) => {
      const entry = sources.get(row.source);
      return entry === undefined ? [] : [{ row, entry }];
    });

  // The frame whose capture cut is already submitted: six faces draw one cut.
  let capturedFor: StarCutFrame | null = null;

  return {
    drawBgl,
    upload,

    encode(encoder, frame, claimTimestampWrites) {
      const live = liveSources(frame);
      if (live.length === 0) return;
      const pass = encoder.beginComputePass({ label: 'star-cut', ...claimTimestampWrites() });
      for (const { row, entry } of live) {
        const { lastMs } = entry.frame;
        const dtMs = lastMs === null ? Infinity : Math.max(0, frame.nowMs - lastMs);
        dispatch(pass, entry.catalog, entry.frame, frame, row, {
          fadeStep: Math.min(1, dtMs / NODE_FADE_MS),
          viewCount: frame.viewCount,
        });
      }
      pass.end();
    },

    submitCapture(frame) {
      if (capturedFor === frame) return;
      capturedFor = frame;
      const live = liveSources(frame);
      if (live.length === 0) return;
      const encoder = device.createCommandEncoder({ label: 'star-cut-capture' });
      const pass = encoder.beginComputePass({ label: 'star-cut-capture' });
      for (const { row, entry } of live) {
        entry.capture ??= createState(`${row.source}-capture`, entry.catalog, entry.nodes);
        // No frustum (six faces see every direction) and no fade (one static frame).
        dispatch(pass, entry.catalog, entry.capture, frame, row, { fadeStep: 1, viewCount: 0 });
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    },

    drawOf(source, stream, capture) {
      const entry = sources.get(source);
      const state = capture ? entry?.capture : entry?.frame;
      if (state === undefined || state === null || state.lastMs === null) return null;
      return {
        bindGroup: state.drawBindGroups[stream],
        indirect: state.draws,
        indirectOffset: stream === 'leaf' ? 0 : AGG_DRAW_BYTE_OFFSET,
      };
    },

    destroy() {
      for (const source of [...sources.keys()]) release(source);
      leafShift.destroy();
      aggShift.destroy();
    },
  };
}
