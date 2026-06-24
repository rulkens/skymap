import { describe, it, expect, vi } from 'vitest';
import { createSceneUniformsBgl } from '../../../../src/services/gpu/bindGroupLayouts/sceneUniforms';

describe('createSceneUniformsBgl', () => {
  it('builds two VERTEX-visible uniform bindings: focus (0) + lensing (1)', () => {
    const createBindGroupLayout = vi.fn().mockReturnValue({ __mock: 'bgl' });
    const fakeDevice = { createBindGroupLayout } as unknown as GPUDevice;
    const bgl = createSceneUniformsBgl(fakeDevice);
    expect(bgl).toBeDefined();
    expect(createBindGroupLayout).toHaveBeenCalledTimes(1);
    const arg = createBindGroupLayout.mock.calls[0]![0]!;
    // Slot 0 = cluster focus, slot 1 = the co-hosted shared lensing buffer.
    // Both VERTEX-visible (see createSceneUniformsBgl's docblock for why
    // lensing rides the focus group rather than a dedicated @group).
    expect(arg.entries).toHaveLength(2);
    expect(arg.entries[0].binding).toBe(0);
    expect(arg.entries[0].visibility).toBe(GPUShaderStage.VERTEX);
    expect(arg.entries[0].buffer.type).toBe('uniform');
    expect(arg.entries[1].binding).toBe(1);
    expect(arg.entries[1].visibility).toBe(GPUShaderStage.VERTEX);
    expect(arg.entries[1].buffer.type).toBe('uniform');
  });
});
