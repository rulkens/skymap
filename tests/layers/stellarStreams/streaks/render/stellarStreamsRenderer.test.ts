import { describe, expect, it, vi } from 'vitest';

import { createStellarStreamsRenderer } from '../../../../../src/layers/stellarStreams/streaks/render/stellarStreamsRenderer';
import { CAMERA_UNIFORM_BYTES } from '../../../../../src/services/gpu/lib/cameraUniforms';
import { STELLAR_STREAMS_LOOKS } from '../../../../../src/layers/stellarStreams/streaks/data/stellarStreamsLooks';
import type { StellarStreamsLook } from '../../../../../src/layers/stellarStreams/streaks/@types/StellarStreamsLook';
import type { StellarStreamsFocus } from '../../../../../src/layers/stellarStreams/streaks/@types/StellarStreamsFocus';
import type { StellarStreamsPayload } from '../../../../../src/layers/stellarStreams/catalog/@types/StellarStreamsPayload';

// `Uniforms` in streams.wesl: eye xyz after the camera prefix, then the look lanes.
const INTENSITY = CAMERA_UNIFORM_BYTES / 4 + 3;

function setup() {
  const writeBuffer =
    vi.fn<(buffer: { label: string }, offset: number, data: Float32Array) => void>();
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn((desc: { label: string }) => ({ label: desc.label, destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  const renderer = createStellarStreamsRenderer(device, 'rgba16float');
  renderer.upload({
    records: new Float32Array(10),
    particleCount: 1,
  } as unknown as StellarStreamsPayload);
  writeBuffer.mockClear();
  const pass = {
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  };
  const draw = (
    which: 'streak' | 'haze',
    look: StellarStreamsLook,
    opacity: number,
    focus: StellarStreamsFocus = { recede: 1, focusedStream: -1 },
  ) =>
    renderer.draw(
      pass as unknown as GPURenderPassEncoder,
      which,
      new Float32Array(16),
      [8, 8],
      100,
      [0, 0, 0],
      0,
      look,
      opacity,
      focus,
    );
  return { writeBuffer, pass, draw };
}

describe('createStellarStreamsRenderer draw', () => {
  it("writes the haze look's lanes into its own block, apart from the streak's", () => {
    const { writeBuffer, pass, draw } = setup();
    const { streak, haze } = STELLAR_STREAMS_LOOKS;
    draw('streak', streak, 1);
    draw('haze', haze, 0.5);

    expect(pass.draw).toHaveBeenCalledTimes(2);
    const [streakWrite, hazeWrite] = writeBuffer.mock.calls;
    // One block per look: two writes into one buffer before submit keep only the last.
    expect(hazeWrite![0].label).not.toBe(streakWrite![0].label);
    const lanes = Array.from(hazeWrite![2].subarray(INTENSITY, INTENSITY + 6));
    expect(lanes).toEqual(
      [haze.intensity * 0.5, haze.sizeScale, haze.stretch, haze.minPx, 0, haze.flow].map(
        Math.fround,
      ),
    );
  });

  it('writes the focused stream and the recede factor after the look lanes, where the WGSL reads them', () => {
    const { writeBuffer, draw } = setup();
    draw('streak', STELLAR_STREAMS_LOOKS.streak, 1, { recede: 0.15, focusedStream: 12 });
    const block = writeBuffer.mock.calls[0]![2];
    // focusedStream at byte 116, recede at 120: right after flow, inside the 128-byte block.
    expect(Array.from(block.subarray(INTENSITY + 6, INTENSITY + 8))).toEqual(
      [12, 0.15].map(Math.fround),
    );
    expect(block.byteLength).toBe(128);
  });

  it('draws nothing when the look or the fade is 0', () => {
    const { writeBuffer, pass, draw } = setup();
    draw('haze', { ...STELLAR_STREAMS_LOOKS.haze, intensity: 0 }, 1);
    draw('haze', STELLAR_STREAMS_LOOKS.haze, 0);
    expect(pass.draw).not.toHaveBeenCalled();
    expect(writeBuffer).not.toHaveBeenCalled();
  });
});
