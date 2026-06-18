// @vitest-environment jsdom
//
// jsdom (not the default node env) because `useAppSelector` is a React hook —
// `renderHook` needs a DOM to mount its probe component. The Provider wrapper is
// built with `createElement` rather than JSX so this stays a `.ts` file, matching
// the project's no-JSX-in-tests convention.

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import { useAppSelector } from '../../src/store/hooks';
import { createAppStore } from '../../src/store/createAppStore';
import type { RootState } from '../../src/store/types';

describe('useAppSelector', () => {
  it('reads the settings slice through a Provider-wrapped store', () => {
    const store = createAppStore();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });

    // Inline selector (no `selectSettings` import — that module is a later task).
    const { result } = renderHook(() => useAppSelector((state: RootState) => state.settings), {
      wrapper,
    });

    // The hook surfaces the live slice, which is the seeded initialState.
    expect(result.current).toBe(store.getState().settings);
    expect(result.current.tier).toBe('medium');
  });
});
