import { describe, expect, it, vi } from 'vitest';

import type { FieldView } from '../../../../../../src/layers/milkyWay/field/@types/FieldView';
import type { GalaxyFieldRenderTargets } from '../../../../../../src/layers/milkyWay/field/@types/GalaxyFieldRenderTargets';

const encode = vi.fn();
vi.mock('../../../../../../src/layers/milkyWay/field/render/createGalaxyFieldRenderer', () => ({
  createGalaxyFieldRenderer: () => ({
    encode,
    hiiSegments: [{ label: 'hii:young', first: 0, count: 3 }],
  }),
}));
vi.mock('../../../../../../src/layers/milkyWay/field/host/render/createIsmMapReadbacks', () => ({
  createIsmMapReadbacks: () => ({}),
}));

const { createGalaxyFieldHost } =
  await import('../../../../../../src/layers/milkyWay/field/host/subsystems/createGalaxyFieldHost');

describe('createGalaxyFieldHost', () => {
  it('plans nothing and encodes nothing until its first tuning', () => {
    const { host } = createGalaxyFieldHost({} as GPUDevice, {
      makeShader: () => ({}) as GPUShaderModule,
      hdrFormat: 'rgba16float',
      dustMapFormat: 'rgba16float',
      onIsmMapLanded: () => {},
      onOrientationRebuilt: () => {},
    });
    const plan = host.plan();
    expect(plan).toEqual({ encodes: [], composites: [] });
    host.encode({} as GPUCommandEncoder, plan, {} as FieldView, 1, {} as GalaxyFieldRenderTargets);
    expect(encode).not.toHaveBeenCalled();
  });
});
