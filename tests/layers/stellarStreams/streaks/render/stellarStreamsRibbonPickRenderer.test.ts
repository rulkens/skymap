import { describe, expect, it, vi } from 'vitest';

import { createStellarStreamsRibbonPickRenderer } from '../../../../../src/layers/stellarStreams/streaks/render/stellarStreamsRibbonPickRenderer';
import { STELLAR_STREAM_RIBBON_RECORD_LANES as LANES } from '../../../../../src/layers/stellarStreams/streaks/data/stellarStreamRibbonRecord.constants';
import { GD_1, SAGITTARIUS, SHORT } from '../../fixtures/streamMeta';
import { CAMERA_UNIFORM_BYTES } from '../../../../../src/services/gpu/lib/cameraUniforms';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../../src/data/selectionEncoding';

function setup() {
  const writeBuffer =
    vi.fn<(buffer: unknown, offset: number, data: ArrayBufferLike | Float32Array) => void>();
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  const renderer = createStellarStreamsRibbonPickRenderer(device, 7);
  // Sagittarius 2 segments, GD-1 1, a one-point stream none, Pal 5 1.
  renderer.upload([SAGITTARIUS, GD_1, { ...GD_1, centrelineMpc: [GD_1.anchorMpc] }, SHORT]);
  const records = writeBuffer.mock.calls[0]![2] as ArrayBuffer;
  const pass = {
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  };
  const draw = (focusedStream: number) =>
    renderer.draw(
      pass as unknown as GPURenderPassEncoder,
      new Float32Array(16),
      [8, 8],
      100,
      [0, 0, 0],
      focusedStream,
    );
  return { records, pass, draw, writeBuffer };
}

describe('createStellarStreamsRibbonPickRenderer', () => {
  it('each segment names its own stream, in meta order', () => {
    const { records } = setup();
    const u32 = new Uint32Array(records);
    const streams = Array.from({ length: u32.length / LANES }, (_, i) => u32[i * LANES + 7]);
    expect(streams).toEqual([0, 0, 1, 3]);
  });

  it('draws every segment at rest, and the focused stream’s run alone under its focus', () => {
    const { pass, draw } = setup();
    draw(-1);
    draw(1);
    draw(3);
    expect(pass.draw.mock.calls).toEqual([
      [4, 4, 0, 0],
      [4, 1, 0, 2],
      [4, 1, 0, 3],
    ]);
  });

  it('a focused stream with no segments stamps nothing', () => {
    const { pass, draw } = setup();
    draw(2);
    expect(pass.draw).not.toHaveBeenCalled();
  });

  it('writes the pick base and the width floor where ribbonPick.wesl reads them', () => {
    const { draw, writeBuffer } = setup();
    draw(-1);
    const block = writeBuffer.mock.calls.at(-1)![2] as Float32Array;
    // `Uniforms`: eye xyz at byte 80, minHalfWidthPx at 92, pickBase (u32) at 96; 112 bytes.
    const eye = CAMERA_UNIFORM_BYTES / 4;
    expect(block.byteLength).toBe(112);
    expect(block[eye + 3]).toBe(2);
    expect(new Uint32Array(block.buffer)[eye + 4]).toBe(packSelection(7, PICK_SENTINEL_OFFSET));
  });
});
