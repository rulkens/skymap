// @vitest-environment jsdom
/**
 * SliderRows maps a `log` field into log10 for the track and back out to stored
 * units, leaves a linear field alone, and names each row's store path.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SliderRowField } from '../../../../../../../tools/mcpm-workbench/@types/ui/SliderRowField';
import SliderRows from '../../../../../../../tools/mcpm-workbench/src/ui/panel/SliderRows/SliderRows';

const FIELDS: readonly SliderRowField<'traceMax' | 'bounces'>[] = [
  { key: 'traceMax', label: 'trace max', min: 0, max: 5, step: 0.05, log: true, format: String },
  { key: 'bounces', label: 'bounces', min: 1, max: 64, step: 1, format: String },
];

function renderRows(values: { traceMax: number; bounces: number }) {
  const onChange = vi.fn();
  render(<SliderRows fields={FIELDS} values={values} path="view.test" onChange={onChange} />);
  return { onChange, slider: (name: string) => screen.getByRole('slider', { name }) };
}

describe('SliderRows', () => {
  it('runs a log field in log10 and shows and writes stored units', () => {
    const { onChange, slider } = renderRows({ traceMax: 100, bounces: 4 });
    expect(slider('trace max').getAttribute('aria-valuenow')).toBe('2');
    expect(slider('trace max').getAttribute('aria-valuetext')).toBe('100');
    fireEvent.keyDown(slider('trace max'), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('traceMax', 100_000);
  });

  it('passes a linear field through unmapped', () => {
    const { onChange, slider } = renderRows({ traceMax: 100, bounces: 4 });
    expect(slider('bounces').getAttribute('aria-valuenow')).toBe('4');
    fireEvent.keyDown(slider('bounces'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('bounces', 5);
  });

  it("names each row's store path under the given prefix", () => {
    renderRows({ traceMax: 100, bounces: 4 });
    expect(screen.getByText('view.test.traceMax')).toBeTruthy();
    expect(screen.getByText('view.test.bounces')).toBeTruthy();
  });

  it('refuses values that miss a field key', () => {
    // @ts-expect-error `bounces` is a field key, so values must carry it.
    render(<SliderRows fields={FIELDS} values={{ traceMax: 1 }} path="p" onChange={() => {}} />);
  });
});
