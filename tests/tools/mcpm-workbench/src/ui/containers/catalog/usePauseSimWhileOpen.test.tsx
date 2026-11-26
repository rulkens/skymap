// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { setRunning } from '../../../../../../../tools/mcpm-workbench/src/state/sim/simSlice';
import { rootReducer } from '../../../../../../../tools/mcpm-workbench/src/store/rootReducer';
import { usePauseSimWhileOpen } from '../../../../../../../tools/mcpm-workbench/src/ui/containers/catalog/usePauseSimWhileOpen';

function setup(running: boolean) {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (d) => d({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(setRunning(running));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(({ open }) => usePauseSimWhileOpen(open), {
    wrapper,
    initialProps: { open: false },
  });
  return { running: () => store.getState().sim.running, hook };
}

describe('usePauseSimWhileOpen', () => {
  it('pauses a running sim while open and runs it again on close', () => {
    const { running, hook } = setup(true);
    hook.rerender({ open: true });
    expect(running()).toBe(false);
    hook.rerender({ open: false });
    expect(running()).toBe(true);
  });

  it('leaves a paused sim paused after close', () => {
    const { running, hook } = setup(false);
    hook.rerender({ open: true });
    hook.rerender({ open: false });
    expect(running()).toBe(false);
  });
});
