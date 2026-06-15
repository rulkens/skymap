import { describe, it, expect } from 'vitest';
import { createMilkyWayPickRenderer } from '../../../../src/services/gpu/renderers/milkyWayPickRenderer';
import type { FadeUniformsBgl } from '../../../../src/@types/rendering/FadeUniformsBgl';

// Null-device pattern, mirrors structureMarkerRenderer.test.ts.  The GPU-
// backed pick round-trip (a click at the galactic centre decodes to
// Source.MilkyWay) is covered by the DoD manual smoke test — the existing
// pick-renderer harness exercises only the null/stub device, so a
// decode-from-texture unit test is not feasible here.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createMilkyWayPickRenderer(ctx, null as unknown as FadeUniformsBgl);
};

describe('milkyWayPickRenderer (null device)', () => {
  it('constructs under a null device', () => {
    const r = newRenderer();
    expect(r).toBeDefined();
    // pickMilkyWay / destroy are callable no-ops with no GPU device.
    // The new signature takes a half-extent (px); pass any value.
    expect(() =>
      r.pickMilkyWay(null as unknown as GPURenderPassEncoder, 24),
    ).not.toThrow();
    expect(() => r.destroy()).not.toThrow();
  });

  it('satisfies the Renderer label contract', () => {
    const r = newRenderer();
    expect(r.label).toBe('milkyWayPickRenderer');
  });
});
