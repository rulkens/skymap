import { describe, expect, it } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { stillFramesOf } from '../../../src/utils/frame/stillFramesOf';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';

const VP = Float32Array.from({ length: 16 }, (_, i) => i * 0.37 + 1) as unknown as Mat4;
const SIZE = { width: 800, height: 600 };
const PREVIOUS = { vp: VP, canvasSize: SIZE, stillFrames: 4 } as unknown as FrameView;

describe('stillFramesOf', () => {
  it('no previous derivation → 0', () => {
    expect(stillFramesOf(undefined, VP, SIZE)).toBe(0);
  });

  it('same vp values (a different Float32Array) and same size → previous.stillFrames + 1', () => {
    expect(stillFramesOf(PREVIOUS, Float32Array.from(VP) as unknown as Mat4, { ...SIZE })).toBe(5);
  });

  it('one vp element differs by one ulp → 0', () => {
    const moved = Float32Array.from(VP);
    const bits = new Uint32Array(moved.buffer);
    bits[7]! += 1;
    expect(stillFramesOf(PREVIOUS, moved as unknown as Mat4, SIZE)).toBe(0);
  });

  it('same vp, height differs → 0', () => {
    expect(stillFramesOf(PREVIOUS, VP, { width: 800, height: 601 })).toBe(0);
  });
});
