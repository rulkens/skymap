// @vitest-environment jsdom

/**
 * RenderTogglesSection — verify the checkbox list reflects the `disabledPasses`
 * prop, groups the passes by the frame program's (target, slab) step structure,
 * and calls `onTogglePass` with the pass name on toggle.
 *
 * The section is presentational — it imports nothing from `store/` or `state/`.
 * Props drive rendering and the `onTogglePass` typed spy captures dispatch-like
 * calls. Grouping is derived from `frameProgram.groupPassNames`, so the row
 * order here is the GROUPED order (matching GpuTimingsSection), not the raw
 * `passNames` draw order.
 *
 * Project convention: `.test.ts` + `createElement` (no JSX) — see
 * `vitest.config.ts` `include` glob `tests/**\/*.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { RenderTogglesSection } from '../../../src/components/DebugPanel/RenderTogglesSection';

// Real togglable pass names spanning four groups, given in draw order. Grouping
// reorders them: star-aggregates (Volumes & aggregates) leads, then the two
// hdr·COSMO rows (Cosmos · HDR), then earth (Foreground bodies · depth), then
// labels (Overlays).
const ALL_NAMES = ['point-sprites', 'procedural-disks', 'labels', 'earth', 'star-aggregates'];
const GROUPED_ORDER = ['star-aggregates', 'point-sprites', 'procedural-disks', 'earth', 'labels'];

describe('RenderTogglesSection', () => {
  it('renders one checkbox per pass name, ordered by pass group', () => {
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const labels = container.querySelectorAll('label');
    expect(labels).toHaveLength(5);
    expect([...labels].map((l) => l.textContent)).toEqual(GROUPED_ORDER);
  });

  it('renders a group header for each non-empty group, in title order', () => {
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const text = container.textContent ?? '';
    const titles = ['Volumes & aggregates', 'Cosmos · HDR', 'Foreground bodies · depth', 'Overlays'];
    for (const t of titles) expect(text).toContain(t);
    // Headers appear in title order.
    const positions = titles.map((t) => text.indexOf(t));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('omits non-togglable composite/pick rows (no such group appears)', () => {
    const { container } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const text = container.textContent ?? '';
    expect(text).not.toContain('Composites & pick');
    expect(text).not.toContain('hdr→swap');
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
        disabledPasses: { earth: true },
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const boxByName = (name: string) =>
      [...container.querySelectorAll('label')].find((l) => l.textContent === name)!
        .querySelector<HTMLInputElement>('input')!;
    expect(boxByName('point-sprites').checked).toBe(true);
    expect(boxByName('earth').checked).toBe(false);
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
    const earthBox = [...container.querySelectorAll('label')]
      .find((l) => l.textContent === 'earth')!
      .querySelector<HTMLInputElement>('input')!;
    fireEvent.click(earthBox);
    expect(onTogglePass).toHaveBeenCalledOnce();
    expect(onTogglePass).toHaveBeenCalledWith('earth');
  });

  it('reflects the prop after the parent re-renders with an updated record', () => {
    const { container, rerender } = render(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: {},
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    const box = () =>
      [...container.querySelectorAll('label')].find((l) => l.textContent === 'labels')!
        .querySelector<HTMLInputElement>('input')!;
    expect(box().checked).toBe(true);
    rerender(
      createElement(RenderTogglesSection, {
        passNames: ALL_NAMES,
        disabledPasses: { labels: true },
        onTogglePass: vi.fn<(name: string) => void>(),
      }),
    );
    expect(box().checked).toBe(false);
  });
});
