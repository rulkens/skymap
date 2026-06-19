// @vitest-environment jsdom

/**
 * RenderTogglesSection — verify the checkbox list reflects the `disabledPasses`
 * prop (read live off the settings store by App) and that toggling dispatches
 * `setPassDisabled({ pass, disabled })` to the RTK store.  The section is a
 * CONTROLLED component: its checkbox state comes from the prop, not local state,
 * so a click dispatches the action and the box only flips once the parent
 * re-renders with the updated record.
 *
 * Project convention (matches Sparkline.test.ts and
 * GpuTimingsSection.test.ts): tests are `.test.ts` and use
 * `createElement` rather than JSX, because `vitest.config.ts`'s
 * `include` glob is `tests/**\/*.test.ts`.
 *
 * The component calls `useAppDispatch`, so renders are wrapped in a
 * Redux Provider backed by a real `createAppStore()` store.  Dispatch
 * assertions read `store.getState()` after the click to confirm the
 * action was processed.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { RenderTogglesSection } from '../../../src/components/DebugPanel/RenderTogglesSection';
import { createAppStore } from '../../../src/store/createAppStore';
import { selectDisabledPasses } from '../../../src/state/settings/selectors';

const ALL_NAMES = ['point-sprites', 'procedural-disks', 'textured-quads', 'textured-disks'];

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
}

describe('RenderTogglesSection', () => {
  it('renders one checkbox per pass name in passNames order', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
      }),
      { wrapper: makeWrapper(store) },
    );
    const labels = container.querySelectorAll('label');
    expect(labels).toHaveLength(4);
    // Spot-check the kebab-case names appear as label text in order.
    expect(labels[0]!.textContent).toContain('point-sprites');
    expect(labels[1]!.textContent).toContain('procedural-disks');
    expect(labels[2]!.textContent).toContain('textured-quads');
    expect(labels[3]!.textContent).toContain('textured-disks');
  });

  it('checks every box when the disabledPasses record is empty', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
      }),
      { wrapper: makeWrapper(store) },
    );
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    for (const box of boxes) {
      expect(box.checked).toBe(true);
    }
  });

  it('renders a checkbox unchecked when its name is in disabledPasses', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: { 'textured-disks': true },
      }),
      { wrapper: makeWrapper(store) },
    );
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    // passNames order: point-sprites, procedural-disks, textured-quads, textured-disks
    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[3]!.checked).toBe(false);
  });

  it('dispatches setPassDisabled({ pass, disabled: true }) when a checked box is unchecked', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
      }),
      { wrapper: makeWrapper(store) },
    );
    const box = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!;
    fireEvent.click(box);
    expect(selectDisabledPasses(store.getState())['textured-quads']).toBe(true);
  });

  it('dispatches setPassDisabled({ pass, disabled: false }) when an unchecked box is re-checked', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: { 'textured-disks': true },
      }),
      { wrapper: makeWrapper(store) },
    );
    const box = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[3]!;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    // The prop still says disabled (parent hasn't re-rendered), but the store
    // now holds the toggle result.
    expect(selectDisabledPasses(store.getState())['textured-disks']).toBe(false);
  });

  it('reflects the prop after the parent re-renders with an updated record', () => {
    const { store } = createAppStore();
    const { container, rerender } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
      }),
      { wrapper: makeWrapper(store) },
    );
    const box = () => container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!;
    expect(box().checked).toBe(true);
    rerender(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: { 'textured-quads': true },
      }),
    );
    expect(box().checked).toBe(false);
  });
});
