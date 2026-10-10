/**
 * `createStarCutGpu` on a mock device: the fade step each encode writes, the
 * once-per-frame capture cut, and the lifecycle of a source's state.
 */
import { describe, it, expect, vi } from 'vitest';

import { createStarCutGpu } from '../../../../src/layers/starCatalog/render/starCutGpu';
import { FADE_STEP_FLOAT_INDEX } from '../../../../src/layers/starCatalog/render/starCutLayout';
import { NODE_FADE_MAX_DT_MS, NODE_FADE_MS } from '../../../../src/data/starNodeFade';
import { Source } from '../../../../src/data/source';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCutInputs } from '../../../../src/layers/starCatalog/@types/StarCutInputs';

const CATALOG: StarCatalog = {
  starCount: 1,
  nodeCount: 1,
  mortonBitsPerAxis: 9,
  cellEdgePc: 1,
  gridOrigin: [0, 0, 0],
  nodes: [{ mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 }],
  records: new Uint8Array(6),
};
const EMPTY: StarCatalog = {
  ...CATALOG,
  starCount: 0,
  nodeCount: 0,
  nodes: [],
  records: new Uint8Array(0),
};

function frame(nowMs: number): StarCutInputs {
  return {
    cut: {
      originMpc: [0, 0, 0],
      planes: new Float32Array(0),
      refineThreshold: 0.05,
      worldSpread: 1,
      leafMarginRad: 0,
      sources: [{ source: Source.GaiaStars, opacity: 1, budgetTypical: 10 }],
    },
    nowMs,
    sizePx: 2.5,
    brightness: 1,
    glowOverlap: 1,
    aggregateIntensityCap: 0.06,
  };
}

function setup() {
  // The uniform scratch is reused, so the fade step is read at write time.
  const fadeSteps: number[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createBuffer: vi.fn((d: GPUBufferDescriptor) => ({ label: d.label, destroy: vi.fn() })),
    createCommandEncoder: vi.fn(() => ({
      beginComputePass: () => pass,
      finish: () => ({}),
    })),
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn((buf: { label?: string }, _offset: number, data: unknown) => {
        if (buf.label?.startsWith('star-cut-uniforms-')) {
          fadeSteps.push(new Float32Array(data as ArrayBuffer)[FADE_STEP_FLOAT_INDEX]!);
        }
      }),
    },
  };
  const pass = {
    setBindGroup: vi.fn(),
    setPipeline: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const encoder = { beginComputePass: vi.fn(() => pass) } as unknown as GPUCommandEncoder;
  const gpu = createStarCutGpu(device as unknown as GPUDevice);
  gpu.upload(Source.GaiaStars, CATALOG);
  const encode = (nowMs: number) => gpu.encode(encoder, frame(nowMs), () => ({}));
  return { gpu, device, encoder, encode, fadeSteps };
}

describe('starCutGpu fade step', () => {
  it('snaps on the first encode, then steps by dt, clamped across an idle gap', () => {
    const { encode, fadeSteps } = setup();
    encode(1000);
    encode(1020);
    encode(1020 + 60_000);
    encode(500); // clock went backwards
    expect(fadeSteps[0]).toBe(1);
    expect(fadeSteps[1]).toBeCloseTo(20 / NODE_FADE_MS, 6);
    expect(fadeSteps[2]).toBeCloseTo(NODE_FADE_MAX_DT_MS / NODE_FADE_MS, 6);
    expect(fadeSteps[3]).toBe(1);
  });
});

describe('starCutGpu capture cut', () => {
  it('is submitted once per frame however many faces ask, with no fade', () => {
    const { gpu, device, fadeSteps } = setup();
    const inputs = frame(0);
    for (let face = 0; face < 6; face++) gpu.submitCapture(inputs);
    expect(device.queue.submit).toHaveBeenCalledTimes(1);
    expect(fadeSteps).toEqual([1]);

    gpu.submitCapture(frame(16));
    expect(device.queue.submit).toHaveBeenCalledTimes(2);
  });
});

describe('starCutGpu lifecycle', () => {
  it('has no draw before the first encode, and an empty catalog releases the state', () => {
    const { gpu, encode, encoder } = setup();
    expect(gpu.drawOf(Source.GaiaStars, 'leaf', false)).toBeNull();
    encode(0);
    expect(gpu.drawOf(Source.GaiaStars, 'leaf', false)).not.toBeNull();

    gpu.upload(Source.GaiaStars, EMPTY);
    expect(gpu.drawOf(Source.GaiaStars, 'leaf', false)).toBeNull();
    const passesBefore = vi.mocked(encoder.beginComputePass).mock.calls.length;
    encode(16);
    expect(vi.mocked(encoder.beginComputePass).mock.calls.length).toBe(passesBefore);
  });
});
