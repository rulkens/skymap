// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  createSceneStore,
  type PreloadedState,
} from '../../../../tools/scene-workbench/src/store/createSceneStore';
import LayerList from '../../../../tools/scene-workbench/src/ui/LayerList/LayerList';
import type { AssetCommon } from '../../../../tools/scene-workbench/@types/AssetCommon';
import type { SceneManifest } from '../../../../tools/scene-workbench/@types/SceneManifest';

const ASSET_COMMON: Omit<AssetCommon, 'label'> = {
  id: 'a1',
  transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
  provenance: {
    source: 'nationalGeodataApi',
    sourceVintage: '2024-01-01',
    pipeline: [{ step: 'bake-lidar', version: '1' }],
  },
};

const MANIFEST_COMMON: Omit<SceneManifest, 'assets'> = {
  formatVersion: 1,
  groupId: 'g1',
  groupName: 'Group One',
  anchor: { kind: 'geodetic', latDeg: 55.6, lonDeg: 12.5, heightMDvr90: 10, headingDeg: 0 },
};

const MANIFEST: SceneManifest = {
  ...MANIFEST_COMMON,
  assets: [
    {
      ...ASSET_COMMON,
      label: 'Facade scan',
      kind: 'pointCloud',
      pointCount: 1_234_567,
      artifactUrl: 'geo3d/g1/a1/points.bin',
    },
  ],
};

const SPLAT_MANIFEST: SceneManifest = {
  ...MANIFEST_COMMON,
  assets: [
    {
      ...ASSET_COMMON,
      label: 'Facade splats',
      kind: 'gaussianSplat',
      splatCount: 42_000,
      artifactUrl: 'geo3d/g1/a1/splats.bin',
    },
  ],
};

const MESH_MANIFEST: SceneManifest = {
  ...MANIFEST_COMMON,
  assets: [
    {
      ...ASSET_COMMON,
      label: 'Facade mesh',
      kind: 'mesh',
      triangleCount: 42_000,
      artifactUrl: 'geo3d/g1/a1/mesh.glb',
    },
  ],
};

function preloadedStateWithManifest(manifest: SceneManifest = MANIFEST): PreloadedState {
  return {
    group: {
      status: 'ready',
      manifest,
      assetStatus: { a1: 'ready' },
      splatMetrics: {},
      error: null,
    },
  };
}

describe('LayerList', () => {
  it("toggles an asset's visibility", () => {
    const { store } = createSceneStore(preloadedStateWithManifest());

    render(
      <Provider store={store}>
        <LayerList />
      </Provider>,
    );

    const checkbox = screen.getByRole('checkbox', { name: /facade scan/i });
    expect(store.getState().view.hiddenAssetIds).not.toContain('a1');

    fireEvent.click(checkbox);
    expect(store.getState().view.hiddenAssetIds).toContain('a1');

    fireEvent.click(checkbox);
    expect(store.getState().view.hiddenAssetIds).not.toContain('a1');
  });

  it("shows a gaussianSplat asset's count in splats", () => {
    const { store } = createSceneStore(preloadedStateWithManifest(SPLAT_MANIFEST));

    const { container } = render(
      <Provider store={store}>
        <LayerList />
      </Provider>,
    );

    expect(container.textContent).toContain('42,000 splats');
  });

  it("shows a mesh asset's count in tris", () => {
    const { store } = createSceneStore(preloadedStateWithManifest(MESH_MANIFEST));

    const { container } = render(
      <Provider store={store}>
        <LayerList />
      </Provider>,
    );

    expect(container.textContent).toContain('42,000 tris');
  });
});
