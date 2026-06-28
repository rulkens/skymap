// @vitest-environment jsdom

/**
 * SettingsPanel (shell) — store-backed integration test.
 *
 * The shell renders seven section containers that all need the Redux store.
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * `sourceCounts` and `structureCounts` are no longer props on `SettingsPanel`;
 * the containers read them from the engine Redux slice directly.
 *
 * Tests assert:
 *  - Each section's CollapsibleSection header button is present in the DOM.
 *    CollapsibleSection titles render as `<button>` elements and stay mounted
 *    even when the section is collapsed, so `getByRole('button', { name })` is
 *    the correct intent-level query (CSS-grid collapse leaves the DOM intact).
 *  - Clicking "Reset camera" fires the `onResetCamera` callback exactly once.
 *
 * Why these assertions?
 *  Without the shell, mounting `SettingsPanel` would fail outright (its type
 *  formerly required ~40 props; the shell requires only 2). With the shell but
 *  a missing container, the corresponding section heading would be absent from
 *  the rendered output. These two checks together guarantee the shell composes
 *  all seven containers and wires the footer action correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { SettingsPanel } from '../../../src/components/SettingsPanel/SettingsPanel';
import { createAppStore } from '../../../src/store/createAppStore';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('SettingsPanel (shell)', () => {
  it('renders all six section headings', () => {
    const { store } = createAppStore();
    const onResetCamera = vi.fn<() => void>();

    render(
      createElement(SettingsPanel, {
        defaultOpen: true,
        onResetCamera,
      }),
      { wrapper: makeWrapper(store) },
    );

    // Each section is a CollapsibleSection whose title renders as a <button>.
    // getByRole checks accessible name, which is the text content of the button.
    expect(screen.getByRole('button', { name: /galaxies/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /cosmic web/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /flow/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /structures/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /labels/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /display/i })).toBeDefined();
  });

  it('calls onResetCamera when "Reset camera" is clicked', () => {
    const { store } = createAppStore();
    const onResetCamera = vi.fn<() => void>();

    render(
      createElement(SettingsPanel, {
        defaultOpen: true,
        onResetCamera,
      }),
      { wrapper: makeWrapper(store) },
    );

    const resetButton = screen.getByRole('button', { name: /reset camera/i });
    fireEvent.click(resetButton);

    expect(onResetCamera).toHaveBeenCalledOnce();
  });
});
