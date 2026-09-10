// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createSceneStore } from '../../../../tools/scene-workbench/src/store/createSceneStore';
import DisplayPanel from '../../../../tools/scene-workbench/src/ui/DisplayPanel/DisplayPanel';

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

  it('drives the gaussianSplat splat-scale slice through its slider', () => {
    const { store } = createSceneStore();

    render(
      <Provider store={store}>
        <DisplayPanel />
      </Provider>,
    );

    const slider = screen.getByRole('slider', { name: /splat scale/i });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(store.getState().view.display.gaussianSplat.splatScale).toBe(1.05);
  });

  it('drives the gaussianSplat opacity-scale slice through its slider', () => {
    const { store } = createSceneStore();

    render(
      <Provider store={store}>
        <DisplayPanel />
      </Provider>,
    );

    const slider = screen.getByRole('slider', { name: /opacity scale/i });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(store.getState().view.display.gaussianSplat.opacityScale).toBe(1.05);
  });
});
