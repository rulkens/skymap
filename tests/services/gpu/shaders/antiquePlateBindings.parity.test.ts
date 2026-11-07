/**
 * The plate's bindings: WebGPU allows 16 sampled textures per fragment stage and a
 * phone may offer no more, so the plate holds a budget below that, and a new row the
 * look writes is a layer of an array row (`ANTIQUE_*_LAYERS`), not a binding. The
 * layout is checked against `fragment.wesl`'s declarations (a mismatch only fails
 * on a GPU) and the WGSL layer constants against the TS maps.
 */
import { describe, expect, it, vi } from 'vitest';

import { createAntiqueLookGpu } from '../../../../src/services/gpu/passes/antiqueLook/createAntiqueLookGpu';
import {
  ANTIQUE_FULL_LAYERS,
  ANTIQUE_LOW_LAYERS,
  ANTIQUE_QUARTER_LAYERS,
} from '../../../../src/data/rendering/antiqueLook';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

/** Four slots under the hard limit, for a row that truly cannot be a layer. */
const PLATE_TEXTURE_BUDGET = 12;

const PLATE = readShaderSource('src/services/gpu/shaders/antiqueLook/fragment.wesl');

function plateLayout(): GPUBindGroupLayoutEntry[] {
  const layouts: GPUBindGroupLayoutDescriptor[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({ getCompilationInfo: () => Promise.resolve({ messages: [] }) })),
    createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => {
      layouts.push(desc);
      return {};
    }),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({ createView: () => ({}) })),
  } as unknown as GPUDevice;
  createAntiqueLookGpu(device, 'bgra8unorm');
  return [...layouts.find((l) => l.label === 'antique-look-plate-bgl')!.entries];
}

/** One word per binding kind, from the layout entry and from the WGSL declaration. */
function layoutKind(entry: GPUBindGroupLayoutEntry): string {
  if (entry.texture) return entry.texture.viewDimension === '2d-array' ? 'array' : 'texture';
  if (entry.sampler) return 'sampler';
  return entry.buffer?.type === 'read-only-storage' ? 'storage' : 'uniform';
}

function shaderKinds(): string[] {
  const kinds: string[] = [];
  for (const [, binding, space, type] of PLATE.matchAll(
    /@group\(0\)\s*@binding\((\d+)\)\s*var(<[^>]*>)?\s+\w+\s*:\s*([\w<>]+)/g,
  )) {
    kinds[Number(binding)] = space?.startsWith('<storage')
      ? 'storage'
      : space?.startsWith('<uniform')
        ? 'uniform'
        : type!.startsWith('texture_2d_array')
          ? 'array'
          : type!.startsWith('texture_')
            ? 'texture'
            : 'sampler';
  }
  return kinds;
}

describe('the antique plate bindings', () => {
  it(`samples at most ${PLATE_TEXTURE_BUDGET} textures`, () => {
    expect(plateLayout().filter((e) => e.texture).length).toBeLessThanOrEqual(PLATE_TEXTURE_BUDGET);
  });

  it('declares in fragment.wesl what its layout binds, binding by binding', () => {
    expect(shaderKinds()).toEqual(plateLayout().map(layoutKind));
  });

  it('reads each array layer where the TS layer maps put it', () => {
    const wgsl = Object.fromEntries(
      [...PLATE.matchAll(/const\s+(\w+)_LAYER\s*:\s*i32\s*=\s*(\d+)\s*;/g)].map(([, n, v]) => [
        n,
        Number(v),
      ]),
    );
    const screaming = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
    const ts = Object.fromEntries(
      [ANTIQUE_FULL_LAYERS, ANTIQUE_QUARTER_LAYERS, ANTIQUE_LOW_LAYERS].flatMap((map) =>
        Object.entries(map).map(([name, layer]) => [screaming(name), layer]),
      ),
    );
    expect(wgsl).toEqual(ts);
  });
});
