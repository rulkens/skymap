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
});
