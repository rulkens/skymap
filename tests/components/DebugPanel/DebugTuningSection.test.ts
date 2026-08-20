// @vitest-environment jsdom

/**
 * DebugTuningSection — the shared board every `*TuningSection` instantiates:
 * a `DebugSection` wrapping one `DebugSlider` row per field, then `children`.
 *
 * Fixture registry only (two rows, keys `a`/`b`) — never a real
 * `*_SLIDER_FIELDS` registry (that would be a registry-mirror test, banned by
 * `testing.md`). Two cases, each catching a real bug no compiler check does:
 *   1. the closure-over-the-loop-row bug — a naive `fields.map` that closes
 *      over the wrong iteration variable would fire `onSliderChange` with the
 *      FIRST row's key no matter which row's input moved;
 *   2. `children` floating above the rows instead of after them — the exact
 *      defect that would misplace ZoA's colour pickers/copy button and MW's
 *      copy button.
 *
 * Project convention: `.test.ts` + `createElement` (no JSX) — see
 * `vitest.config.ts` `include` glob `tests/**\/*.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import DebugTuningSection from '../../../src/components/DebugPanel/DebugTuningSection';
import type { SliderField } from '../../../src/@types/data/SliderField';

type FixtureKey = 'a' | 'b';

const FIXTURE_FIELDS: readonly SliderField<FixtureKey>[] = [
  { key: 'a', label: 'A', min: 0, max: 10, step: 1, format: (v) => `${v}` },
  { key: 'b', label: 'B', min: 0, max: 10, step: 1, format: (v) => `${v}` },
];

const FIXTURE_VALUES: Record<FixtureKey, number> = { a: 1, b: 2 };

describe('DebugTuningSection', () => {
  it('calls onSliderChange with the SECOND row key and value when its input moves', () => {
    // `createElement`'s generic inference can't specialize DebugTuningSection's
    // `K` from a plain object literal, so the mock is typed on `string` (the
    // erased generic bound) rather than `FixtureKey` — assertions still check
    // the real fixture keys.
    const onSliderChange = vi.fn<(key: string, value: number) => void>();
    const { container } = render(
      createElement(DebugTuningSection, {
        title: 'Fixture tuning',
        fields: FIXTURE_FIELDS,
        values: FIXTURE_VALUES,
        onSliderChange,
      }),
    );
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type=range]');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[1]!, { target: { value: '7' } });
    expect(onSliderChange).toHaveBeenCalledOnce();
    expect(onSliderChange).toHaveBeenCalledWith('b', 7);
  });

  it('renders children after the last slider row', () => {
    const { container } = render(
      createElement(
        DebugTuningSection,
        {
          title: 'Fixture tuning',
          fields: FIXTURE_FIELDS,
          values: FIXTURE_VALUES,
          onSliderChange: vi.fn<(key: string, value: number) => void>(),
        },
        createElement('button', { type: 'button' }, 'extra'),
      ),
    );
    const body = container.querySelector('details > div')!;
    const children = Array.from(body.children);
    // Two slider rows, then the extra child last.
    expect(children).toHaveLength(3);
    expect(children[2]!.tagName).toBe('BUTTON');
    expect(children[2]!.textContent).toBe('extra');
  });
});
