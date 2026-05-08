import { describe, it, expect } from 'vitest';
import { createProceduralDiskRenderer } from '../../../../src/services/gpu/renderers/proceduralDiskRenderer';

describe('proceduralDiskRenderer', () => {
  it('exports the factory as a function', () => {
    // Full instantiation requires a GPUDevice which we can't easily
    // mock without pulling a WebGPU-shim dependency.  Visual correctness
    // is verified manually in Task 11.  This test exists so the file
    // gets type-checked + ensures the export shape doesn't drift.
    //
    // Post-Spec-F.1 the renderer is a closure-returning factory rather
    // than a class, so we no longer assert on a `prototype.draw` /
    // `prototype.destroy` shape — the public surface is captured by
    // the `ProceduralDiskRenderer` type alias and verified at compile time.
    expect(typeof createProceduralDiskRenderer).toBe('function');
  });
});
