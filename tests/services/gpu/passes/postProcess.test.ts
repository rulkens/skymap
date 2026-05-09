/**
 * Tests for the combined HDR-target + tone-map post-process module.
 *
 * Two layers of coverage live in this file:
 *
 *   1. The aggregate factory `createPostProcess` — verified with a
 *      mocked GPUDevice (Vitest runs in Node without a real GPU).  We
 *      check that the exposed surface is correct, that resize swaps in
 *      a fresh texture view, and that destroy releases both the HDR
 *      texture and the tone-map uniform buffer.  This replaces the old
 *      `hdrTarget.test.ts`'s coverage of the texture lifecycle.
 *
 *   2. The JS-mirror tone-map curves (`linearClamp`, `reinhardExtended`,
 *      ...) — quick spot checks here; the deeper invariants (monotone,
 *      maps 0→0, asymptotes, etc.) live in the longer-standing
 *      `toneMap.test.ts`, which now also imports from `postProcess`.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createPostProcess,
  linearClamp,
  reinhardExtended,
  asinhStretch,
  gamma2,
  acesFilmic,
} from '../../../../src/services/gpu/passes/postProcess';

function mockDevice(): GPUDevice {
  // Each mock returns a plain object the production code never
  // inspects — only the *call counts* matter for these tests.  The
  // texture mock returns a fresh view+destroy pair per call so the
  // resize test can detect view replacement.
  return {
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    // postProcess wires a dev-mode getCompilationInfo logger after
    // creating the shader module (so the linked WGSL is available when
    // a compile error fires under wesl-plugin's `?static` linker, since
    // browser error line numbers map to the linked output not the
    // source). Vitest sets `import.meta.env.DEV = true` by default, so
    // the mock has to expose getCompilationInfo even though we never
    // assert on its output here.
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

describe('createPostProcess', () => {
  it('exposes view, resize, draw, destroy', () => {
    const post = createPostProcess(mockDevice(), 'bgra8unorm', { width: 800, height: 600 });
    expect(post.view).toBeDefined();
    expect(typeof post.resize).toBe('function');
    expect(typeof post.draw).toBe('function');
    expect(typeof post.destroy).toBe('function');
  });

  it('view reflects the new texture immediately after resize', () => {
    const device = mockDevice();
    const post = createPostProcess(device, 'bgra8unorm', { width: 800, height: 600 });
    const viewBefore = post.view;
    post.resize({ width: 1024, height: 768 });
    const viewAfter = post.view;
    // Different texture allocations → different views.
    expect(viewAfter).not.toBe(viewBefore);
  });

  it('destroy releases both the HDR texture and the tone-map uniform buffer', () => {
    const device = mockDevice();
    const post = createPostProcess(device, 'bgra8unorm', { width: 800, height: 600 });
    post.destroy();
    // Both .destroy() methods were called.
    expect(
      (device.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value.destroy,
    ).toHaveBeenCalled();
    expect(
      (device.createBuffer as ReturnType<typeof vi.fn>).mock.results[0]!.value.destroy,
    ).toHaveBeenCalled();
  });
});

describe('postProcess JS-mirror tone-map curves', () => {
  it('linearClamp clamps to [0, 1]', () => {
    expect(linearClamp(0.5, 1)).toBe(0.5);
    expect(linearClamp(2, 1)).toBe(1);
    expect(linearClamp(-1, 1)).toBe(0);
  });
  it('reinhardExtended hits 1.0 at the whitepoint', () => {
    expect(reinhardExtended(4, 1, 4)).toBeCloseTo(1, 5);
  });
  it('asinhStretch hits 1.0 at c=1', () => {
    expect(asinhStretch(1, 1)).toBeCloseTo(1, 5);
  });
  it('gamma2 = sqrt(c·exposure)', () => {
    expect(gamma2(0.25, 1)).toBeCloseTo(0.5, 5);
  });
  it('acesFilmic monotonically increases', () => {
    expect(acesFilmic(0.1, 1)).toBeLessThan(acesFilmic(0.2, 1));
    expect(acesFilmic(0.2, 1)).toBeLessThan(acesFilmic(0.5, 1));
  });
});
