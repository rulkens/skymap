import { describe, it, expect } from 'vitest';
import { createSelectionRingRenderer } from '../../../../src/services/gpu/renderers/selectionRingRenderer';

// Build a renderer with a null device — the factory guards all GPU calls
// behind `if (device)`, so CPU state is exercisable without WebGPU.
// Mirrors `markerLineRenderer.test.ts`.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'bgra8unorm' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createSelectionRingRenderer(ctx);
};

describe('SelectionRingRenderer (CPU state)', () => {
  it('starts with no selection', () => {
    const r = newRenderer();
    expect(r.hasSelection()).toBe(false);
  });

  it('reports hasSelection after setSelection', () => {
    const r = newRenderer();
    r.setSelection({ worldPos: [1, 2, 3], ringRadiusPx: 40 });
    expect(r.hasSelection()).toBe(true);
  });

  it('clears on setSelection(null)', () => {
    const r = newRenderer();
    r.setSelection({ worldPos: [1, 2, 3], ringRadiusPx: 40 });
    r.setSelection(null);
    expect(r.hasSelection()).toBe(false);
  });

  it('render() is a no-op when nothing is selected', () => {
    const r = newRenderer();
    // No throw — early-return on null device AND empty selection. Pass a
    // null encoder to prove the no-op never touches it.
    r.render(null as unknown as GPURenderPassEncoder, new Float32Array(16), [1280, 720]);
  });
});
