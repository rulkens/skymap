import { describe, it, expect } from 'vitest';
import { createDebugLineRenderer } from '../../../../src/services/gpu/renderers/debugLineRenderer';
import type { DebugLine } from '../../../../src/@types/rendering/DebugLine';

// Build a DebugLineRenderer with a null device — like markerLineRenderer, the
// factory guards every GPU call behind `if (device)`, so CPU-side line-count
// state is safe to exercise without a real WebGPU context.
const newRenderer = (maxLines?: number) => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createDebugLineRenderer(ctx, maxLines);
};

const line = (): DebugLine => ({ from: [0, 0, 0], to: [0, 1, 0], width: 3, color: [1, 0, 0, 1] });

describe('DebugLineRenderer (CPU state)', () => {
  it('starts with zero lines', () => {
    expect(newRenderer().lineCount()).toBe(0);
  });

  it('counts lines after setLines', () => {
    const r = newRenderer();
    r.setLines([line(), line()]);
    expect(r.lineCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLines', () => {
    const r = newRenderer();
    r.setLines([line()]);
    r.setLines([line(), line(), line()]);
    expect(r.lineCount()).toBe(3);
  });

  it('clears on setLines([])', () => {
    const r = newRenderer();
    r.setLines([line(), line()]);
    r.setLines([]);
    expect(r.lineCount()).toBe(0);
  });

  it('caps at maxLines', () => {
    const r = newRenderer(2);
    r.setLines([line(), line(), line()]);
    expect(r.lineCount()).toBe(2);
  });
});
