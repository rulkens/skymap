// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { BoundsM } from '../../../../tools/scene-workbench/@types/BoundsM';
import { createSceneStore } from '../../../../tools/scene-workbench/src/store/createSceneStore';
import { splatOrderWritten } from '../../../../tools/scene-workbench/src/state/commands';
import DisplayPanel from '../../../../tools/scene-workbench/src/ui/DisplayPanel/DisplayPanel';

const BOUNDS_M: BoundsM = { min: [-10, -20, 0], max: [10, 20, 30] };

/** The panel learns a splat asset's extent only from a completed sort, so a
 *  store with no `splatOrderWritten` behind it has no clip-box group at all. */
function storeWithSplats() {
  const { store } = createSceneStore();
  store.dispatch(
    splatOrderWritten({
      assetId: 'a1',
      drawCount: 900,
      splatCount: 1000,
      boundsM: BOUNDS_M,
    }),
  );
  return store;
}

describe('DisplayPanel', () => {
  it('drives the point-cloud point-size slice through the slider', () => {
    const { store } = createSceneStore();

    render(
      <Provider store={store}>
        <DisplayPanel />
      </Provider>,
    );

    const slider = screen.getByRole('slider', { name: /point size/i });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(store.getState().view.display.pointCloud.pointSizePx).toBe(2.5);
  });

  it('drives each gaussianSplat slice through its own slider, not its neighbour', () => {
    const { store } = createSceneStore();

    render(
      <Provider store={store}>
        <DisplayPanel />
      </Provider>,
    );

    fireEvent.keyDown(screen.getByRole('slider', { name: /splat scale/i }), { key: 'ArrowRight' });
    expect(store.getState().view.display.gaussianSplat).toEqual({
      splatScale: 1.05,
      opacityScale: 1,
      clipBoxM: null,
    });

    fireEvent.keyDown(screen.getByRole('slider', { name: /opacity scale/i }), {
      key: 'ArrowRight',
    });
    expect(store.getState().view.display.gaussianSplat).toEqual({
      splatScale: 1.05,
      opacityScale: 1.05,
      clipBoxM: null,
    });
  });

  it('hides the clip-box group until a splat asset has reported its extent', () => {
    const { store } = createSceneStore();

    render(
      <Provider store={store}>
        <DisplayPanel />
      </Provider>,
    );

    expect(screen.queryByRole('checkbox', { name: /clip box/i })).toBeNull();
  });

  it('enables the clip box at the asset extent, then narrows it from the X min slider', () => {
    const store = storeWithSplats();

    render(
      <Provider store={store}>
        <DisplayPanel />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /clip box/i }));
    expect(store.getState().view.display.gaussianSplat.clipBoxM).toEqual(BOUNDS_M);

    fireEvent.keyDown(screen.getByRole('slider', { name: /x min/i }), { key: 'ArrowRight' });
    expect(store.getState().view.display.gaussianSplat.clipBoxM).toEqual({
      min: [-9, -20, 0],
      max: [10, 20, 30],
    });

    expect(screen.getByText('900 / 1,000 splats')).toBeTruthy();
  });
});
