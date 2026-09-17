// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import {
  defaultOutlineSlice,
  type OutlineDraft,
} from '../../../../tools/scene-workbench/src/state/outline/outlineSlice';
import { defaultViewSlice } from '../../../../tools/scene-workbench/src/state/view/viewSlice';
import { createSceneStore } from '../../../../tools/scene-workbench/src/store/createSceneStore';
import MeshOutlineControls from '../../../../tools/scene-workbench/src/ui/MeshOutlineControls/MeshOutlineControls';

function renderWithDraft(closed: boolean) {
  const draft: OutlineDraft = {
    assetId: 'mesh',
    ringM: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    closed,
    returnPose: defaultViewSlice.camera,
  };
  const { store } = createSceneStore({ outline: { ...defaultOutlineSlice, draft } });
  return render(
    <Provider store={store}>
      <MeshOutlineControls assetId="mesh" />
    </Provider>,
  );
}

describe('MeshOutlineControls', () => {
  it('Save is enabled only on a closed ring', () => {
    const open = renderWithDraft(false);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    open.unmount();

    renderWithDraft(true);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
  });
});
