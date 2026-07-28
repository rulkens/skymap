// @vitest-environment jsdom

/**
 * AutoRotateToggleContainer — verify the container reads `autoRotate` from the
 * store, dispatches `setAutoRotate` on toggle, and forwards `hidden` to the
 * presentational component.
 *
 * Pattern: store-backed via `createAppStore()` + `<Provider>`, `createElement`
 * (no JSX — matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`),
 * and a `makeWrapper(store)` helper mirroring `RenderTogglesSection.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import AutoRotateToggleContainer from '../../../src/components/containers/AutoRotateToggleContainer';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import { selectAutoRotate } from '../../../src/state/camera/selectors';

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('AutoRotateToggleContainer', () => {
  it('reflects autoRotate=false from a seeded store (renders the Play affordance)', () => {
    // Default store has autoRotate=false (DEFAULT_AUTO_ROTATE).
    const { store } = createAppStore();
    const { container } = render(createElement(AutoRotateToggleContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });
    // When autoRotate=false, aria-pressed is "false" and label is "Start camera auto-rotate".
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-pressed')).toBe('false');
    expect(button!.getAttribute('aria-label')).toBe('Start camera auto-rotate');
  });

  it('dispatches setAutoRotate(true) when toggled from off', () => {
    // Default store: autoRotate=false.
    const { store } = createAppStore();
    const { container } = render(createElement(AutoRotateToggleContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });
    const button = container.querySelector('button')!;
    fireEvent.click(button);
    // The store now holds autoRotate=true.
    expect(selectAutoRotate(store.getState())).toBe(true);
  });

  it('forwards hidden through to the presentational toggle', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(AutoRotateToggleContainer, { hidden: true }), {
      wrapper: makeWrapper(store),
    });
    // PillButton sets aria-hidden="true" and adds the hidden CSS class when hidden=true.
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-hidden')).toBe('true');
  });
});
