/**
 * letterboxRenderer — the bar geometry against a recording pass encoder, plus the
 * real `?static` imports so weslStaticPlugin links `letterbox/*.wesl` under Vitest.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLetterboxRenderer } from '../../../../../src/services/gpu/renderers/letterbox/letterboxRenderer';

function mockDevice(): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
  } as unknown as GPUDevice;
}

function recordingPass() {
  const calls: string[] = [];
  const pass = {
    setPipeline: vi.fn(() => void calls.push('pipeline')),
    setScissorRect: vi.fn((...rect: number[]) => void calls.push(`scissor ${rect.join(' ')}`)),
    draw: vi.fn((count: number) => void calls.push(`draw ${count}`)),
  };
  return { pass: pass as unknown as GPURenderPassEncoder, calls };
}

describe('createLetterboxRenderer', () => {
  const renderer = createLetterboxRenderer({ device: mockDevice(), targetFormat: 'bgra8unorm' });

  it('draws a top and a bottom bar under scissor rects, then resets the scissor', () => {
    // floor((900 − 1600 / 2.39) / 2) = 115
    const { pass, calls } = recordingPass();
    renderer.draw(pass, { width: 1600, height: 900 });
    expect(calls).toEqual([
      'pipeline',
      'scissor 0 0 1600 115',
      'draw 3',
      'scissor 0 785 1600 115',
      'draw 3',
      'scissor 0 0 1600 900',
    ]);
  });

  it('draws nothing on a frame already wider than 2.39:1', () => {
    const { pass, calls } = recordingPass();
    renderer.draw(pass, { width: 2400, height: 900 });
    expect(calls).toEqual([]);
  });
});
