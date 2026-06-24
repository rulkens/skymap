// @vitest-environment jsdom

/**
 * DebugSlider — verify the shared labelled range row renders its label and
 * pre-formatted readout, binds min/max/step/value onto the range input with an
 * a11y label, and reports a NUMBER (not the raw string) through onChange.
 *
 * Project convention: `.test.ts` + `createElement` (no JSX) — see
 * `vitest.config.ts` `include` glob `tests/**\/*.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { DebugSlider } from '../../../src/components/DebugPanel/DebugSlider';

describe('DebugSlider', () => {
  it('renders the label and the pre-formatted readout', () => {
    const { container } = render(
      createElement(DebugSlider, {
        label: 'Strength',
        value: 5,
        min: 0,
        max: 10,
        step: 1,
        readout: '5×',
        onChange: vi.fn<(v: number) => void>(),
      }),
    );
    expect(container.textContent).toContain('Strength');
    expect(container.textContent).toContain('5×');
  });

  it('binds min/max/step/value and labels the input for a11y', () => {
    const { container } = render(
      createElement(DebugSlider, {
        label: 'Trail',
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
        readout: '0.500',
        onChange: vi.fn<(v: number) => void>(),
      }),
    );
    const input = container.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(input.min).toBe('0');
    expect(input.max).toBe('1');
    expect(input.step).toBe('0.01');
    expect(input.value).toBe('0.5');
    expect(input.getAttribute('aria-label')).toBe('Trail');
  });

  it('reports a numeric value through onChange, not the raw string', () => {
    const onChange = vi.fn<(v: number) => void>();
    const { container } = render(
      createElement(DebugSlider, {
        label: 'Speed',
        value: 2,
        min: 0,
        max: 10,
        step: 0.5,
        readout: '2.0',
        onChange,
      }),
    );
    const input = container.querySelector<HTMLInputElement>('input[type=range]')!;
    fireEvent.change(input, { target: { value: '3.5' } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(3.5);
    expect(typeof onChange.mock.calls[0]![0]).toBe('number');
  });
});
