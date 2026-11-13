import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { startCameraTween } from '../../../src/state/camera/cameraIntentSlice';
import { inputGestureStarted } from '../../../src/state/input/inputSlice';
import { cameraRoute } from '../../../src/store/constants';
import type { CameraTweenDescriptor } from '../../../src/@types/camera/focusMotion/CameraTweenDescriptor';

describe('cameraIntentSlice answers input', () => {
  it('inputGestureStarted clears the tween', () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(startCameraTween({} as CameraTweenDescriptor));
    expect(store.getState()[cameraRoute].intent.tween).not.toBeNull();

    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    expect(store.getState()[cameraRoute].intent.tween).toBeNull();
  });
});
