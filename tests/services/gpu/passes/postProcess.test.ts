/**
 * Tests for the HDR-target post-process module.
 *
 * This file covers the aggregate factory `createPostProcess` — verified
 * with a mocked GPUDevice (Vitest runs in Node without a real GPU).  We
 * check that the exposed surface is correct, that resize swaps in a fresh
 * texture view, that destroy releases the HDR texture (and never touches a
 * uniform buffer — the tone-map draw's resources now live in the
 * `Compositor`), and that `draw` opens one clearing swap-chain pass and
 * delegates the tone-map blit to the injected compositor.  This replaces
 * the old `hdrTarget.test.ts`'s coverage of the texture lifecycle.
 *
 * The JS-mirror tone-map curves moved to `compositor.ts` (the module that
 * now owns the tone-map draw), and their coverage lives in
 * `toneMap.test.ts` which imports them from there — so this file no
 * longer duplicates it.
 */
import { describe, it, expect, vi } from 'vitest';
import { createPostProcess } from '../../../../src/services/gpu/passes/postProcess';
import type { Compositor } from '../../../../src/@types/rendering/Compositor';

function mockDevice(): GPUDevice {
  // Each mock returns a plain object the production code never inspects —
  // only the *call counts* matter for these tests.  The texture mock
  // returns a fresh view+destroy pair per call so the resize test can
  // detect view replacement.  `createBuffer` is a spy that must stay
  // *unused*: postProcess no longer owns a uniform buffer, so the destroy
  // test asserts it was never called.
  return {
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
  } as unknown as GPUDevice;
}

function mockCompositor(): Compositor {
  return {
    label: 'compositor',
    draw: vi.fn<Compositor['draw']>(),
    destroy: vi.fn<() => void>(),
  };
}

// A command encoder whose `beginRenderPass` returns a pass exposing `end`.
// The pass object identity is what the compositor delegation asserts on.
function mockEncoder(): {
  beginRenderPass: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  const end = vi.fn<() => void>();
  const beginRenderPass = vi.fn(() => ({ end }));
  return { beginRenderPass, end };
}

describe('createPostProcess', () => {
  it('exposes view, resize, draw, destroy', () => {
    const post = createPostProcess({
      device: mockDevice(),
      size: { width: 800, height: 600 },
      compositor: mockCompositor(),
    });
    expect(post.view).toBeDefined();
    expect(typeof post.resize).toBe('function');
    expect(typeof post.draw).toBe('function');
    expect(typeof post.destroy).toBe('function');
  });

  it('view reflects the new texture immediately after resize', () => {
    const post = createPostProcess({
      device: mockDevice(),
      size: { width: 800, height: 600 },
      compositor: mockCompositor(),
    });
    const viewBefore = post.view;
    post.resize({ width: 1024, height: 768 });
    const viewAfter = post.view;
    // Different texture allocations → different views.
    expect(viewAfter).not.toBe(viewBefore);
  });

  it('destroy releases the HDR texture and never allocates a uniform buffer', () => {
    const device = mockDevice();
    const post = createPostProcess({
      device,
      size: { width: 800, height: 600 },
      compositor: mockCompositor(),
    });
    post.destroy();
    // The HDR texture's destroy fired.
    expect(
      (device.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value.destroy,
    ).toHaveBeenCalled();
    // The tone-map uniform buffer is gone (it lives in the compositor now),
    // so postProcess never calls createBuffer at all.
    expect(device.createBuffer as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('draw opens one clearing pass on the swap view and delegates to the compositor', () => {
    const compositor = mockCompositor();
    const post = createPostProcess({
      device: mockDevice(),
      size: { width: 800, height: 600 },
      compositor,
    });
    const encoder = mockEncoder();
    const swapView = {} as GPUTextureView;
    const hdrView = post.view;

    post.draw(encoder as unknown as GPUCommandEncoder, swapView, 1.5, 2);

    // Exactly one swap-chain pass, clearing to black on the swap view.
    expect(encoder.beginRenderPass).toHaveBeenCalledTimes(1);
    const descriptor = encoder.beginRenderPass.mock.calls[0]![0];
    expect(descriptor.colorAttachments[0].view).toBe(swapView);
    expect(descriptor.colorAttachments[0].loadOp).toBe('clear');

    // Delegates the blit: begun pass, the current HDR view, 'replace', and
    // the *raw* (unclamped) tone params.
    const begunPass = encoder.beginRenderPass.mock.results[0]!.value;
    expect(compositor.draw).toHaveBeenCalledWith(begunPass, hdrView, 'replace', {
      exposure: 1.5,
      curve: 2,
    });
    // The pass is closed after the delegated draw.
    expect(encoder.end).toHaveBeenCalled();
  });

  it('timing descriptor is spread into the internal pass only when provided', () => {
    const post = createPostProcess({
      device: mockDevice(),
      size: { width: 800, height: 600 },
      compositor: mockCompositor(),
    });
    const swapView = {} as GPUTextureView;
    const timing = {} as GPURenderPassTimestampWrites;

    const withTiming = mockEncoder();
    post.draw(withTiming as unknown as GPUCommandEncoder, swapView, 1, 0, timing);
    expect(withTiming.beginRenderPass.mock.calls[0]![0].timestampWrites).toBe(timing);

    const withoutTiming = mockEncoder();
    post.draw(withoutTiming as unknown as GPUCommandEncoder, swapView, 1, 0);
    expect('timestampWrites' in withoutTiming.beginRenderPass.mock.calls[0]![0]).toBe(false);
  });
});
