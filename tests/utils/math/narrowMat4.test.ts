import { describe, it, expect } from 'vitest';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';

describe('narrowMat4', () => {
  it('narrows a known f64 matrix element-wise to f32', () => {
    // Build a Float64Array with known values that will be narrowed to f32.
    // Use a mix of values that are exactly representable in f32 and values
    // that require rounding when narrowed from f64.
    const f64Matrix = new Float64Array([
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      2.5,
      0.0,
      0.0,
      0.0,
      0.0,
      3.141592653589793, // pi in f64 — will narrow to f32 precision
      0.0,
      100.1,
      -50.7,
      0.0,
      1.0,
    ]);

    const f32Matrix = narrowMat4(f64Matrix);

    // Verify it's a Float32Array and has the correct length.
    expect(f32Matrix).toBeInstanceOf(Float32Array);
    expect(f32Matrix.length).toBe(16);

    // Each element should be close to (within f32 precision) the f64 input.
    // toBeCloseTo uses a default tolerance suitable for f32 precision.
    for (let i = 0; i < 16; i++) {
      expect(f32Matrix[i] as number).toBeCloseTo(f64Matrix[i] as number, 5);
    }
  });

  it('preserves a value that is exactly representable in f32', () => {
    // Some values like 0.5, 2, and 1 are exactly representable in both f64 and f32.
    const f64Matrix = new Float64Array([
      0.5,
      0.0,
      0.0,
      0.0,
      0.0,
      2.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
    ]);

    const f32Matrix = narrowMat4(f64Matrix);

    // For exactly representable values, the f32 result should be identical (toBe).
    expect(f32Matrix[0]).toBe(0.5);
    expect(f32Matrix[5]).toBe(2.0);
    expect(f32Matrix[10]).toBe(1.0);
    expect(f32Matrix[15]).toBe(0.0);
  });
});
