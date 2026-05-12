import { describe, it, expect } from 'vitest';
import { buildSegmentInstances } from '../../../../src/services/gpu/renderers/filamentRenderer';
import type { FilamentCloud } from '../../../../src/@types/data/FilamentCloud';

describe('buildSegmentInstances', () => {
  it('emits one instance per consecutive vertex pair within each strip', () => {
    // Two strips: A (3 verts → 2 segments), B (2 verts → 1 segment) = 3 segments
    const cloud: FilamentCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3, 5]),
      vertices: new Float32Array([
        10, 20, 30, 0.9, 11, 21, 31, 0.8, 12, 22, 32, 0.7, 40, 50, 60, 0.6, 41, 51, 61, 0.5,
      ]),
    };
    const result = buildSegmentInstances(cloud);
    expect(result.segmentCount).toBe(3);
    expect(result.data.length).toBe(3 * 8); // 8 floats per segment

    // First segment of strip A: (v0, v1).
    // Note: expected is wrapped in Float32Array so the f32-precision
    // round-trip on 0.9/0.8/0.7/0.6 matches what `result.data` (also
    // a Float32Array) holds.  Comparing raw JS-double literals via
    // toEqual would mismatch by ~1e-8 because 0.9 isn't representable
    // in 32-bit float.
    expect(Array.from(result.data.slice(0, 8))).toEqual(
      Array.from(new Float32Array([10, 20, 30, 0.9, 11, 21, 31, 0.8])),
    );
    // Second segment of strip A: (v1, v2)
    expect(Array.from(result.data.slice(8, 16))).toEqual(
      Array.from(new Float32Array([11, 21, 31, 0.8, 12, 22, 32, 0.7])),
    );
    // First (only) segment of strip B: (v3, v4)
    expect(Array.from(result.data.slice(16, 24))).toEqual(
      Array.from(new Float32Array([40, 50, 60, 0.6, 41, 51, 61, 0.5])),
    );
  });

  it('handles zero strips', () => {
    const cloud: FilamentCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    const result = buildSegmentInstances(cloud);
    expect(result.segmentCount).toBe(0);
    expect(result.data.length).toBe(0);
  });
});
