import { describe, it, expect } from 'vitest';
import { createMarkerLineRenderer } from '../../../../src/services/gpu/renderers/markerLineRenderer';

// Build a MarkerLineRenderer with a null device — the factory guards all GPU
// calls behind `if (device)`, so CPU state is safe to exercise in unit
// tests without a real WebGPU context.  This mirrors `labelRenderer.test.ts`'s
// null-device pattern.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createMarkerLineRenderer(ctx);
};

describe('MarkerLineRenderer (CPU state)', () => {
  it('starts with zero lines', () => {
    const r = newRenderer();
    expect(r.lineCount()).toBe(0);
  });

  it('counts lines after setLines', () => {
    const r = newRenderer();
    r.setLines([
      { id: 'a', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
      { id: 'b', fromWorld: [1, 0, 0], toWorld: [1, 2, 0], pixelWidth: 1.5, color: [1, 0, 0, 1] },
    ]);
    expect(r.lineCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLines', () => {
    const r = newRenderer();
    r.setLines([{ id: 'a', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] }]);
    r.setLines([
      { id: 'b', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
      { id: 'c', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
      { id: 'd', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
    ]);
    expect(r.lineCount()).toBe(3);
  });

  it('caps at maxLines', () => {
    const ctx = {
      device: null as unknown as GPUDevice,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
    };
    const r = createMarkerLineRenderer(ctx, 2);
    r.setLines([
      { id: 'a', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
      { id: 'b', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
      { id: 'c', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
    ]);
    expect(r.lineCount()).toBe(2);
  });
});
