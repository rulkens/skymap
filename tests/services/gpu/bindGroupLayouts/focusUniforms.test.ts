import { describe, it, expect, vi } from 'vitest';
import { createFocusUniformsBgl } from '../../../../src/services/gpu/bindGroupLayouts/focusUniforms';

describe('createFocusUniformsBgl', () => {
  it('builds one VERTEX-visible uniform binding at slot 0', () => {
    const createBindGroupLayout = vi.fn().mockReturnValue({ __mock: 'bgl' });
    const fakeDevice = { createBindGroupLayout } as unknown as GPUDevice;
    const bgl = createFocusUniformsBgl(fakeDevice);
    expect(bgl).toBeDefined();
    expect(createBindGroupLayout).toHaveBeenCalledTimes(1);
    const arg = createBindGroupLayout.mock.calls[0]![0]!;
    expect(arg.entries).toHaveLength(1);
    expect(arg.entries[0].binding).toBe(0);
    expect(arg.entries[0].visibility).toBe(GPUShaderStage.VERTEX);
    expect(arg.entries[0].buffer.type).toBe('uniform');
  });
});
