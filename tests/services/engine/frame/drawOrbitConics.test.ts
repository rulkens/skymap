import { describe, expect, it, vi } from 'vitest';
import { drawOrbitConics } from '../../../../src/services/engine/frame/drawOrbitConics';
import type { OrbitTrail } from '../../../../src/@types/rendering/orbitTrailRenderer/OrbitTrail';
import type { OrbitTrailView } from '../../../../src/@types/rendering/orbitTrailRenderer/OrbitTrailView';
import type { OrbitTrailRenderer } from '../../../../src/@types/rendering/orbitTrailRenderer/OrbitTrailRenderer';

// Eye at the origin looking down -z under a plain perspective; column-major f64.
const vp = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.02, 0]);
const at: OrbitTrailView = {
  slabVp: vp,
  viewportPx: [1000, 1000],
  eyeMpc: [0, 0, 0],
  pxPerRad: 1000,
  occluders: { count: 0, spheresKm: new Float32Array(4) },
  depth: { frame: null, view: {} as GPUTextureView },
  showImpostor: false,
};
const trail = (radiusMpc: number): OrbitTrail => ({
  centerMpc: [0, 0, -1],
  semiMajorMpc: [radiusMpc, 0, 0],
  semiMinorMpc: [0, radiusMpc, 0],
  eccentricity: 0,
  meanAnomalyRad: 0,
  color: [1, 1, 1],
  fade: 1,
});

function fake() {
  const draw = vi.fn<OrbitTrailRenderer['draw']>();
  return { renderer: { draw } as unknown as OrbitTrailRenderer, draw };
}

describe('drawOrbitConics', () => {
  it('draws only the trails writeOrbitTrailRecord accepts', () => {
    const { renderer, draw } = fake();
    drawOrbitConics({} as GPURenderPassEncoder, renderer, [trail(1e-12), trail(0.3)], at);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]![1].count).toBe(1);
  });

  it('does not call draw when every trail is culled', () => {
    const { renderer, draw } = fake();
    drawOrbitConics({} as GPURenderPassEncoder, renderer, [trail(1e-12)], at);
    expect(draw).not.toHaveBeenCalled();
  });
});
