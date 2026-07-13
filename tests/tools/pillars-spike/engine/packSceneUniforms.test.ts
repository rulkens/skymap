import { describe, expect, it } from 'vitest';

import { packSceneUniforms } from '../../../../tools/pillars-spike/src/engine/packSceneUniforms';

// Offset-lock for the WGSL SceneUniforms struct (lib/scene.wesl). These
// tests exist to fail when someone reorders/extends the struct and updates
// only one side — the bug renders garbage with no validation error.

function args() {
  return {
    viewProj: new Float32Array(Array.from({ length: 16 }, (_, i) => 100 + i)),
    camPos: [1, 2, 3] as const,
    camRight: [4, 5, 6] as const,
    camUp: [7, 8, 9] as const,
    camFwd: [10, 11, 12] as const,
    tanHalfFov: 0.5,
    aspect: 1.75,
    timeSec: 42,
    frame: 7,
    densityMul: 1.1,
    emissionMul: 2.2,
    scatterMul: 3.3,
    ambientMul: 4.4,
    starBrightness: 5.5,
    phaseG: 0.6,
    detailErosion: 0.7,
    detailScale: 8.8,
  };
}

describe('packSceneUniforms', () => {
  it('writes every field at its WGSL struct offset', () => {
    const out = packSceneUniforms(args(), new Float32Array(40));
    // viewProj occupies the first 16 floats.
    expect(Array.from(out.slice(0, 16))).toEqual(Array.from({ length: 16 }, (_, i) => 100 + i));
    // vec3 + trailing scalar packing: pos/time, right/tanHalfFov,
    // up/aspect, fwd/frame — the layout WGSL's 16-byte alignment dictates.
    expect(Array.from(out.slice(16, 20))).toEqual([1, 2, 3, 42]);
    expect(Array.from(out.slice(20, 24))).toEqual([4, 5, 6, 0.5]);
    expect(Array.from(out.slice(24, 28))).toEqual([7, 8, 9, 1.75]);
    expect(Array.from(out.slice(28, 32))).toEqual([10, 11, 12, 7]);
    expect(out[32]).toBeCloseTo(1.1);
    expect(out[33]).toBeCloseTo(2.2);
    expect(out[34]).toBeCloseTo(3.3);
    expect(out[35]).toBeCloseTo(4.4);
    expect(out[36]).toBeCloseTo(5.5);
    expect(out[37]).toBeCloseTo(0.6);
    expect(out[38]).toBeCloseTo(0.7);
    expect(out[39]).toBeCloseTo(8.8);
  });

  it('rejects an undersized scratch buffer', () => {
    expect(() => packSceneUniforms(args(), new Float32Array(39))).toThrow(/40 floats/);
  });
});
