// @vitest-environment jsdom

/**
 * RenderTogglesSection — verify the checkbox list reflects the `disabledPasses`
 * prop (read live off the settings store by App) and that toggling calls
 * `passOverrides.setDisabled` with the right (name, disabled) pair. The section
 * is a CONTROLLED component: its checkbox state comes from the prop, not local
 * state, so a click fires the handle and the box only flips once the parent
 * re-renders with the updated set.
 *
 * Project convention (matches Sparkline.test.ts and
 * GpuTimingsSection.test.ts): tests are `.test.ts` and use
 * `createElement` rather than JSX, because `vitest.config.ts`'s
 * `include` glob is `tests/**\/*.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { RenderTogglesSection } from '../../../src/components/DebugPanel/RenderTogglesSection';
import type { PassOverridesHandle } from '../../../src/@types/engine/handles/EngineDebugHandle';

const ALL_NAMES = ['point-sprites', 'procedural-disks', 'textured-quads', 'textured-disks'];

function makeHandle(): {
  handle: PassOverridesHandle;
  setDisabled: ReturnType<typeof vi.fn>;
} {
  const setDisabled = vi.fn<(name: string, disabled: boolean) => void>();
  const handle: PassOverridesHandle = { allNames: ALL_NAMES, setDisabled };
  return { handle, setDisabled };
}

describe('RenderTogglesSection', () => {
  it('renders one checkbox per pass name in allNames order', () => {
    const { handle } = makeHandle();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passOverrides: handle,
        disabledPasses: new Set<string>(),
      }),
    );
    const labels = container.querySelectorAll('label');
    expect(labels).toHaveLength(4);
    // Spot-check the kebab-case names appear as label text in order.
    expect(labels[0]!.textContent).toContain('point-sprites');
    expect(labels[1]!.textContent).toContain('procedural-disks');
    expect(labels[2]!.textContent).toContain('textured-quads');
    expect(labels[3]!.textContent).toContain('textured-disks');
  });

  it('checks every box when the disabledPasses set is empty', () => {
    const { handle } = makeHandle();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passOverrides: handle,
        disabledPasses: new Set<string>(),
      }),
    );
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    for (const box of boxes) {
      expect(box.checked).toBe(true);
    }
  });

  it('renders a checkbox unchecked when its name is in disabledPasses', () => {
    const { handle } = makeHandle();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passOverrides: handle,
        disabledPasses: new Set(['textured-disks']),
      }),
    );
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    // allNames order: point-sprites, procedural-disks, textured-quads, textured-disks
    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[3]!.checked).toBe(false);
  });

  it('calls setDisabled(name, true) when a checked box is unchecked', () => {
    const { handle, setDisabled } = makeHandle();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passOverrides: handle,
        disabledPasses: new Set<string>(),
      }),
    );
    const box = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!;
    fireEvent.click(box);
    expect(setDisabled).toHaveBeenCalledWith('textured-quads', true);
  });

  it('calls setDisabled(name, false) when an unchecked box is re-checked', () => {
    const { handle, setDisabled } = makeHandle();
    const { container } = render(
      createElement(RenderTogglesSection, {
        passOverrides: handle,
        disabledPasses: new Set(['textured-disks']),
      }),
    );
    const box = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[3]!;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(setDisabled).toHaveBeenCalledWith('textured-disks', false);
  });

  it('reflects the prop after the parent re-renders with an updated set', () => {
    const { handle } = makeHandle();
    const { container, rerender } = render(
      createElement(RenderTogglesSection, {
        passOverrides: handle,
        disabledPasses: new Set<string>(),
      }),
    );
    const box = () => container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!;
    expect(box().checked).toBe(true);
    rerender(
      createElement(RenderTogglesSection, {
        passOverrides: handle,
        disabledPasses: new Set(['textured-quads']),
      }),
    );
    expect(box().checked).toBe(false);
  });
});
