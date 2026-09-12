/**
 * The two halves of the renderer table `tsc` cannot check: a kind added to
 * `GpuAsset` and to the table but forgotten in `SCENE_DRAW_ORDER` compiles and
 * simply never draws, and the table's `as` cast at the dispatch site would let
 * a row receive another kind's assets.
 */
import { describe, expect, it, vi } from 'vitest';

import type {
  GpuAsset,
  RenderResources,
} from '../../../../tools/scene-workbench/src/render/renderResources';
import {
  createSceneRenderers,
  SCENE_DRAW_ORDER,
} from '../../../../tools/scene-workbench/src/render/sceneRenderers';

// Hoisted with the mock factories: they run at import time, before a plain
// module-level `const` would have initialised.
const { drawn } = vi.hoisted(() => ({ drawn: [] as [string, unknown[]][] }));

// The root vitest config links `.wesl?static` against the app's `wesl.toml`,
// which does not include this tool's shader tree — so the factory modules are
// stubbed rather than linked.
vi.mock('../../../../tools/scene-workbench/src/render/lidarPointRenderer', () => ({
  createLidarPointRenderer: () => ({
    draw: (...args: unknown[]) => drawn.push(['pointCloud', args]),
  }),
}));
vi.mock('../../../../tools/scene-workbench/src/render/splatRenderer', () => ({
  createSplatRenderer: () => ({
    draw: (...args: unknown[]) => drawn.push(['gaussianSplat', args]),
  }),
}));
vi.mock('../../../../tools/scene-workbench/src/render/texturedMeshRenderer', () => ({
  createTexturedMeshRenderer: () => ({ draw: (...args: unknown[]) => drawn.push(['mesh', args]) }),
}));

// Exhaustive by construction: a new kind fails to compile here until listed.
const ALL_KINDS: Record<GpuAsset['kind'], true> = {
  pointCloud: true,
  mesh: true,
  gaussianSplat: true,
};

describe('SCENE_DRAW_ORDER', () => {
  it('names every GpuAsset kind exactly once', () => {
    expect([...SCENE_DRAW_ORDER].sort()).toEqual(Object.keys(ALL_KINDS).sort());
  });
});

describe('createSceneRenderers', () => {
  it('gives each kind its own non-hidden assets, in draw order', () => {
    const assets: [string, GpuAsset][] = [
      ['cloud', { kind: 'pointCloud' } as GpuAsset],
      ['hidden-mesh', { kind: 'mesh' } as GpuAsset],
      ['mesh', { kind: 'mesh' } as GpuAsset],
      ['splats', { kind: 'gaussianSplat' } as GpuAsset],
    ];
    const resources = { gpuAssets: new Map(assets) } as RenderResources;
    const pass = {} as GPURenderPassEncoder;
    const display = { mesh: { wireframe: true } };

    drawn.length = 0;
    createSceneRenderers(
      {} as Parameters<typeof createSceneRenderers>[0],
      'rgba8unorm',
      {} as GPUBindGroupLayout,
    ).draw(pass, resources, ['hidden-mesh'], display);

    expect(drawn).toEqual([
      ['pointCloud', [pass, [resources.gpuAssets.get('cloud')], display]],
      ['mesh', [pass, [resources.gpuAssets.get('mesh')], display]],
      ['gaussianSplat', [pass, [resources.gpuAssets.get('splats')], display]],
    ]);
  });
});
