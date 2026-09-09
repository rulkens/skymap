// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  createSceneStore,
  type PreloadedState,
} from '../../../../tools/scene-workbench/src/store/createSceneStore';
import LayerList from '../../../../tools/scene-workbench/src/ui/LayerList/LayerList';
import type { SceneManifest } from '../../../../tools/scene-workbench/@types/SceneManifest';

const MANIFEST: SceneManifest = {
  formatVersion: 1,
  groupId: 'g1',
  groupName: 'Group One',
  anchor: { kind: 'geodetic', latDeg: 55.6, lonDeg: 12.5, heightMDvr90: 10, headingDeg: 0 },
  assets: [
    {
      id: 'a1',
      label: 'Facade scan',
      kind: 'pointCloud',
      pointCount: 1_234_567,
      artifactUrl: 'geo3d/g1/a1/points.bin',
      transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
      provenance: {
        source: 'nationalGeodataApi',
        sourceVintage: '2024-01-01',
        pipeline: [{ step: 'bake-lidar', version: '1' }],
      },
    },
  ],
};

function preloadedStateWithManifest(): PreloadedState {
  return {
    group: {
      status: 'ready',
      manifest: MANIFEST,
      assetStatus: { a1: 'ready' },
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
});
