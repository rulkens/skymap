// @vitest-environment jsdom

/**
 * RenderTogglesSection — verify the checkbox list mirrors the handle's
 * `isDisabled` state on mount and that toggling calls `setDisabled`
 * with the right (name, disabled) pair.
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

function makeHandle(initiallyDisabled: ReadonlySet<string> = new Set()): {
  handle: PassOverridesHandle;
  setDisabled: ReturnType<typeof vi.fn>;
} {
  const disabled = new Set(initiallyDisabled);
  const setDisabled = vi.fn((name: string, isDisabled: boolean) => {
    if (isDisabled) disabled.add(name);
    else disabled.delete(name);
  });
  const handle: PassOverridesHandle = {
    allNames: ['point-sprites', 'procedural-disks', 'textured-quads', 'textured-disks'],
    isDisabled: (name) => disabled.has(name),
    setDisabled,
  };
  return { handle, setDisabled };
}

describe('RenderTogglesSection', () => {
  it('renders one checkbox per pass name in allNames order', () => {
    const { handle } = makeHandle();
    const { container } = render(createElement(RenderTogglesSection, { passOverrides: handle }));
    const labels = container.querySelectorAll('label');
    expect(labels).toHaveLength(4);
    // Spot-check the kebab-case names appear as label text in order.
    expect(labels[0]!.textContent).toContain('point-sprites');
    expect(labels[1]!.textContent).toContain('procedural-disks');
    expect(labels[2]!.textContent).toContain('textured-quads');
    expect(labels[3]!.textContent).toContain('textured-disks');
  });

  it('checks every box on mount when the handle reports nothing disabled', () => {
    const { handle } = makeHandle();
    const { container } = render(createElement(RenderTogglesSection, { passOverrides: handle }));
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    for (const box of boxes) {
      expect(box.checked).toBe(true);
    }
  });

  it('initialises a checkbox as unchecked when the handle reports it disabled', () => {
    const { handle } = makeHandle(new Set(['textured-disks']));
    const { container } = render(createElement(RenderTogglesSection, { passOverrides: handle }));
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    // allNames order: point-sprites, procedural-disks, textured-quads, textured-disks
    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[3]!.checked).toBe(false);
  });

  it('calls handle.setDisabled(name, true) when a checked box is unchecked', () => {
    const { handle, setDisabled } = makeHandle();
    const { container } = render(createElement(RenderTogglesSection, { passOverrides: handle }));
    const box = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!;
    fireEvent.click(box);
    expect(setDisabled).toHaveBeenCalledWith('textured-quads', true);
    expect(box.checked).toBe(false);
  });

  it('calls handle.setDisabled(name, false) when an unchecked box is re-checked', () => {
    const { handle, setDisabled } = makeHandle(new Set(['textured-disks']));
    const { container } = render(createElement(RenderTogglesSection, { passOverrides: handle }));
    const box = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[3]!;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(setDisabled).toHaveBeenCalledWith('textured-disks', false);
    expect(box.checked).toBe(true);
  });
});
