// @vitest-environment jsdom

/**
 * RenderTogglesSection — verify the checkbox list reflects the `disabledPasses`
 * prop and that toggling calls the `onTogglePass` callback with the pass name.
 *
 * The section is NOW presentational — it imports nothing from `store/` or
 * `state/`.  Accordingly these tests need no Redux Provider: props drive
 * rendering and the `onTogglePass` typed spy captures dispatch-like calls.
 *
 * The render/checkbox-state assertions from the original store-backed suite are
 * preserved unchanged; only the toggle-assertion replaces the store-read with a
 * spy call check.
 *
 * Project convention: `.test.ts` + `createElement` (no JSX) — see
 * `vitest.config.ts` `include` glob `tests/**\/*.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { RenderTogglesSection } from '../../../src/components/DebugPanel/RenderTogglesSection';

const ALL_NAMES = ['point-sprites', 'procedural-disks', 'textured-quads', 'textured-disks'];

describe('RenderTogglesSection', () => {
  it('renders one checkbox per pass name in passNames order', () => {
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const labels = container.querySelectorAll('label');
    expect(labels).toHaveLength(4);
    expect(labels[0]!.textContent).toContain('point-sprites');
    expect(labels[1]!.textContent).toContain('procedural-disks');
    expect(labels[2]!.textContent).toContain('textured-quads');
    expect(labels[3]!.textContent).toContain('textured-disks');
  });

  it('checks every box when the disabledPasses record is empty', () => {
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    for (const box of boxes) {
      expect(box.checked).toBe(true);
    }
  });

  it('renders a checkbox unchecked when its name is in disabledPasses', () => {
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: { 'textured-disks': true },
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    // passNames order: point-sprites, procedural-disks, textured-quads, textured-disks
    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[3]!.checked).toBe(false);
  });

  it('calls onTogglePass with the pass name when a checkbox is clicked', () => {
    const onTogglePass = vi.fn<(name: string) => void>();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass,
      }),
    );
    // Click the third box (index 2) — 'textured-quads'
    const box = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!;
    fireEvent.click(box);
    expect(onTogglePass).toHaveBeenCalledOnce();
    expect(onTogglePass).toHaveBeenCalledWith('textured-quads');
  });

  it('reflects the prop after the parent re-renders with an updated record', () => {
    const { container, rerender } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const box = () => container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!;
    expect(box().checked).toBe(true);
    rerender(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: { 'textured-quads': true },
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    expect(box().checked).toBe(false);
  });
});
