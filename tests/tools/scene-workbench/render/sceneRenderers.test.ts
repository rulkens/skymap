/**
 * SCENE_DRAW_ORDER is the one part of the renderer table `tsc` cannot check: a
 * kind added to `GpuAsset` and to the table but forgotten in the order array
 * compiles and simply never draws.
 */
import { describe, expect, it, vi } from 'vitest';

import type { GpuAsset } from '../../../../tools/scene-workbench/src/render/renderResources';
import { SCENE_DRAW_ORDER } from '../../../../tools/scene-workbench/src/render/sceneRenderers';

// The root vitest config links `.wesl?static` against the app's `wesl.toml`,
// which does not include this tool's shader tree — so the factory modules are
// stubbed rather than linked.
vi.mock('../../../../tools/scene-workbench/src/render/lidarPointRenderer', () => ({
  createLidarPointRenderer: () => ({ draw: () => {} }),
}));
vi.mock('../../../../tools/scene-workbench/src/render/splatRenderer', () => ({
  createSplatRenderer: () => ({ draw: () => {} }),
}));

// Exhaustive by construction: a new kind fails to compile here until listed.
const ALL_KINDS: Record<GpuAsset['kind'], true> = {
  pointCloud: true,
  gaussianSplat: true,
};

describe('SCENE_DRAW_ORDER', () => {
  it('names every GpuAsset kind exactly once', () => {
    expect([...SCENE_DRAW_ORDER].sort()).toEqual(Object.keys(ALL_KINDS).sort());
  });

  it('draws every opaque kind before gaussianSplat', () => {
    // Splats blend over depth they never write, so they must go last.
    expect(SCENE_DRAW_ORDER.indexOf('gaussianSplat')).toBe(SCENE_DRAW_ORDER.length - 1);
  });
});
