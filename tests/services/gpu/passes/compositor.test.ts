/**
 * Tests for the unified `createCompositor` primitive.
 *
 * Verified with a mocked GPUDevice (Vitest runs in Node without a real
 * GPU) — only call counts and captured descriptors / uniform bytes
 * matter. Coverage:
 *
 *   - the exposed surface (label / draw / destroy);
 *   - the pipeline cache: one pipeline per (blend, dstFormat) key,
 *     reused across draws, distinct across blends AND across dst formats
 *     (the same blend into two formats builds two pipelines);
 *   - the blend-state table (replace = no blend, over = straight-alpha
 *     OVER, additive = one/one);
 *   - the dst format is baked from the per-draw `dstFormat` arg (threaded
 *     by the caller from the composite's dest target), not derived from
 *     the blend;
 *   - the packed uniform bytes (clamped exposure, whitepoint², curve,
 *     toneEnabled, preserveAlpha-from-blend);
 *   - the covering-triangle encode (draw(3,1,0,0), no beginRenderPass);
 *   - destroy releasing every cached uniform buffer.
 *
 * The JS-mirror curve math itself is exercised in `toneMap.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCompositor } from '../../../../src/services/gpu/passes/compositor';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';

// A basic tone-map for draws where the exact bytes don't matter.
const TONE: ToneMap = { exposure: 1, curve: 1, hdrKnee: 0, hdrHeadroom: 0 };

// Dst formats threaded per draw (the caller resolves these from the dest
// target). SWAP mirrors the swap chain on macOS; HDR the rgba16float buffer.
const SWAP: GPUTextureFormat = 'bgra8unorm';
const HDR: GPUTextureFormat = 'rgba16float';

function mockDevice(): GPUDevice {
  // Each mock returns a plain object the production code never inspects
  // — only call counts + captured descriptors matter. createRenderPipeline
  // records its descriptor in `.mock.calls`; createBuffer returns a fresh
  // destroy spy per call so the destroy test can assert on each.
  return {
    createSampler: vi.fn(() => ({})),
    // The compositor routes shader creation through a dev-mode
    // getCompilationInfo logger (wesl-plugin `?static` linker maps error
    // line numbers to the linked WGSL, not the source). Vitest sets
    // `import.meta.env.DEV = true`, so the mock must expose it.
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn<() => void>() })),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn<(buf: GPUBuffer, off: number, data: ArrayBuffer) => void>() },
  } as unknown as GPUDevice;
}

function mockPass() {
  return {
    setPipeline: vi.fn<(p: GPURenderPipeline) => void>(),
    setBindGroup: vi.fn<(index: number, bg: GPUBindGroup) => void>(),
    draw: vi.fn<(v: number, i: number, fv: number, fi: number) => void>(),
  };
}

const SRC = {} as unknown as GPUTextureView;

function make(device: GPUDevice) {
  return createCompositor({ device });
}

// Snapshot the ArrayBuffer that was handed to writeBuffer on call `i`.
// The compositor reuses one scratch ArrayBuffer across draws, so we must
// copy immediately after each draw — reading the live reference after a
// later draw would see the later draw's bytes.
function packedBytes(device: GPUDevice, i: number): ArrayBuffer {
  const calls = (device.queue.writeBuffer as ReturnType<typeof vi.fn>).mock.calls;
  return (calls[i]![2] as ArrayBuffer).slice(0);
}

function pipelineDescriptors(device: GPUDevice): GPURenderPipelineDescriptor[] {
  return (device.createRenderPipeline as ReturnType<typeof vi.fn>).mock.calls.map(
    (c) => c[0] as GPURenderPipelineDescriptor,
  );
}

// `fragment.targets` is typed as an Iterable, so spread it to index the
// first color-target state.
function target0(desc: GPURenderPipelineDescriptor): GPUColorTargetState {
  return [...desc.fragment!.targets][0] as GPUColorTargetState;
}

describe('createCompositor', () => {
  it('exposes label, draw, destroy', () => {
    const c = make(mockDevice());
    expect(c.label).toBe('compositor');
    expect(typeof c.draw).toBe('function');
    expect(typeof c.destroy).toBe('function');
  });

  it('builds one pipeline per (blend, dstFormat) key and reuses it across draws', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    c.draw(pass, SRC, 'replace', TONE, SWAP);
    c.draw(pass, SRC, 'replace', TONE, SWAP);
    expect(device.createRenderPipeline).toHaveBeenCalledTimes(1);
  });

  it('distinct blends build distinct pipelines', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    // Same dstFormat both draws: the blend is the only thing that differs, so
    // two pipelines proves the blend is part of the key.
    c.draw(pass, SRC, 'replace', TONE, SWAP);
    c.draw(pass, SRC, 'additive', null, SWAP);
    expect(device.createRenderPipeline).toHaveBeenCalledTimes(2);
  });

  it('the same blend into two dst formats builds two pipelines', () => {
    // The reason dst format is threaded per draw rather than derived from the
    // blend: `over` targets the swap chain in one composite and the HDR buffer
    // in another, and each needs its own pipeline with that format baked in.
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    c.draw(pass, SRC, 'over', TONE, SWAP);
    c.draw(pass, SRC, 'over', TONE, HDR);
    expect(device.createRenderPipeline).toHaveBeenCalledTimes(2);
    const [swapDesc, hdrDesc] = pipelineDescriptors(device);
    expect(target0(swapDesc!).format).toBe(SWAP);
    expect(target0(hdrDesc!).format).toBe(HDR);
  });

  it('replace has no blend state; over is straight-alpha OVER; additive is one/one', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    c.draw(pass, SRC, 'replace', TONE, SWAP);
    c.draw(pass, SRC, 'over', TONE, SWAP);
    c.draw(pass, SRC, 'additive', null, HDR);
    const [replaceDesc, overDesc, additiveDesc] = pipelineDescriptors(device);

    expect(target0(replaceDesc!).blend).toBeUndefined();

    expect(target0(overDesc!).blend).toEqual({
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    });

    expect(target0(additiveDesc!).blend).toEqual({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
  });

  it('bakes the passed dstFormat into the pipeline target, not one derived from the blend', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    // Each draw's target format is whatever the caller hands in — including the
    // formerly-impossible `over → hdr`, proving the blend no longer dictates it.
    c.draw(pass, SRC, 'replace', TONE, SWAP);
    c.draw(pass, SRC, 'over', TONE, HDR);
    c.draw(pass, SRC, 'additive', null, HDR);
    const [replaceDesc, overDesc, additiveDesc] = pipelineDescriptors(device);
    expect(target0(replaceDesc!).format).toBe(SWAP);
    expect(target0(overDesc!).format).toBe(HDR);
    expect(target0(additiveDesc!).format).toBe(HDR);
  });

  it('tone set packs clamped exposure, curve, and toneEnabled=1', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;

    c.draw(pass, SRC, 'replace', { exposure: 1e9, curve: 2, hdrKnee: 0, hdrHeadroom: 0 }, SWAP);
    const b1 = packedBytes(device, 0);
    const f1 = new Float32Array(b1);
    const u1 = new Uint32Array(b1);
    expect(f1[0]).toBe(16); // exposure clamped to the upper bound
    expect(f1[1]).toBe(16); // whitepoint² = 4²
    expect(f1[2]).toBe(10); // asinh softness default
    expect(u1[3]).toBe(2); // curve
    expect(u1[4]).toBe(1); // toneEnabled

    c.draw(pass, SRC, 'replace', { exposure: 1e-9, curve: 2, hdrKnee: 0, hdrHeadroom: 0 }, SWAP);
    const f2 = new Float32Array(packedBytes(device, 1));
    expect(f2[0]).toBeCloseTo(0.05, 6); // exposure clamped to the lower bound
  });

  it('tone null packs toneEnabled=0', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    c.draw(pass, SRC, 'over', null, SWAP);
    expect(new Uint32Array(packedBytes(device, 0))[4]).toBe(0);
  });

  it('preserveAlpha packs from the blend, not the caller', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    c.draw(pass, SRC, 'replace', TONE, SWAP);
    expect(new Uint32Array(packedBytes(device, 0))[5]).toBe(0);
    c.draw(pass, SRC, 'over', TONE, SWAP);
    expect(new Uint32Array(packedBytes(device, 1))[5]).toBe(1);
  });

  it('draw encodes the covering triangle', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass();
    c.draw(pass as unknown as GPURenderPassEncoder, SRC, 'replace', TONE, SWAP);
    expect(pass.draw).toHaveBeenCalledWith(3, 1, 0, 0);
    expect(pass.setPipeline).toHaveBeenCalled();
    expect(pass.setBindGroup).toHaveBeenCalled();
    // The compositor never opens its own render pass: `mockPass()` above
    // exposes no `beginRenderPass`, and the draw completing without
    // throwing proves the compositor only ever called setPipeline /
    // setBindGroup / draw on the pass encoder it was handed.
  });

  it('destroy releases every cached uniform buffer', () => {
    const device = mockDevice();
    const c = make(device);
    const pass = mockPass() as unknown as GPURenderPassEncoder;
    c.draw(pass, SRC, 'replace', TONE, SWAP); // key 1 → buffer 1
    c.draw(pass, SRC, 'additive', null, HDR); // key 2 → buffer 2
    c.destroy();
    const results = (device.createBuffer as ReturnType<typeof vi.fn>).mock.results;
    expect(results).toHaveLength(2);
    expect(results[0]!.value.destroy).toHaveBeenCalled();
    expect(results[1]!.value.destroy).toHaveBeenCalled();
  });
});
