import { describe, it, expect } from 'vitest';
import { ProceduralDiskRenderer } from '../../../src/services/gpu/proceduralDiskRenderer';

describe('ProceduralDiskRenderer', () => {
  it('exports the class as a value', () => {
    // Full instantiation requires a GPUDevice which we can't easily
    // mock without pulling a WebGPU-shim dependency.  Visual correctness
    // is verified manually in Task 11.  This test exists so the file
    // gets type-checked + ensures the export shape doesn't drift.
    expect(typeof ProceduralDiskRenderer).toBe('function');
    expect(ProceduralDiskRenderer.prototype.draw).toBeTypeOf('function');
    expect(ProceduralDiskRenderer.prototype.destroy).toBeTypeOf('function');
  });
});
