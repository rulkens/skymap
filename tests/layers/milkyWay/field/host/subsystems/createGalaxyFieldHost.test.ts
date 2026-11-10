import { describe, expect, it, vi } from 'vitest';

import type { FieldView } from '../../../../../../src/layers/milkyWay/field/@types/FieldView';
import type { GalaxyFieldRenderTargets } from '../../../../../../src/layers/milkyWay/field/@types/GalaxyFieldRenderTargets';

const encode = vi.fn();
const teardown: string[] = [];
vi.mock('../../../../../../src/layers/milkyWay/field/render/createGalaxyFieldRenderer', () => ({
  createGalaxyFieldRenderer: () => ({
    encode,
    hiiSegments: [{ label: 'hii:young', first: 0, count: 3 }],
    dispose: () => teardown.push('dispose'),
  }),
}));
vi.mock('../../../../../../src/layers/milkyWay/field/host/render/createIsmMapReadbacks', () => ({
  createIsmMapReadbacks: () => ({ cancel: () => teardown.push('cancel') }),
}));

const { createGalaxyFieldHost } =
  await import('../../../../../../src/layers/milkyWay/field/host/subsystems/createGalaxyFieldHost');

const makeHost = () =>
  createGalaxyFieldHost({} as GPUDevice, {
    makeShader: () => ({}) as GPUShaderModule,
    hdrFormat: 'rgba16float',
    dustMapFormat: 'rgba16float',
    onIsmMapLanded: () => {},
    onOrientationRebuilt: () => {},
  }).host;

describe('createGalaxyFieldHost', () => {
  it('plans nothing and encodes nothing until its first tuning', () => {
    const host = makeHost();
    const plan = host.plan();
    expect(plan).toEqual({ encodes: [], composites: [] });
    host.encode({} as GPUCommandEncoder, plan, {} as FieldView, 1, {} as GalaxyFieldRenderTargets);
    expect(encode).not.toHaveBeenCalled();
  });

  it('cancels the ISM readbacks before disposing the renderer', () => {
    // A v2 -> v1 switch destroys the host mid-readback; cancelling first is
    // what keeps that landing off a disposed renderer and `requestRender`.
    makeHost().destroy();
    expect(teardown).toEqual(['cancel', 'dispose']);
  });
});
