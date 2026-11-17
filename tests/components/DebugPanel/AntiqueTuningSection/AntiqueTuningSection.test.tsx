// @vitest-environment jsdom

/**
 * AntiqueTuningSection — a row switch must patch the whole `rows` record (a partial
 * one would drop the other rows from the store and print them as switched off),
 * Reset is offered only once something moved, and Copy hands back only what moved.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import AntiqueTuningSection from '../../../../src/components/DebugPanel/AntiqueTuningSection/AntiqueTuningSection';
import { ANTIQUE_TUNING_DEFAULTS } from '../../../../src/data/rendering/antiqueTuning';
import type { AntiqueTuning } from '../../../../src/@types/settings/AntiqueTuning';

function renderSection(tuning: AntiqueTuning = ANTIQUE_TUNING_DEFAULTS) {
  const onChange = vi.fn<(patch: Partial<AntiqueTuning>) => void>();
  const onReset = vi.fn();
  const view = render(
    <AntiqueTuningSection enabled tuning={tuning} onChange={onChange} onReset={onReset} />,
  );
  return { ...view, onChange, onReset };
}

describe('AntiqueTuningSection', () => {
  it('dragging hatch spacing patches that knob alone', () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText('Hatch spacing'), { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ hatchUnits: 6 });
  });

  it('switching a row off keeps every other row on', () => {
    const { onChange } = renderSection();
    fireEvent.click(screen.getByLabelText('Body hatching'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      rows: { ...ANTIQUE_TUNING_DEFAULTS.rows, hatching: false },
    });
  });

  it('forcing a sky ruling frame patches skyRulings', () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText('Sky rulings'), { target: { value: 'galactic' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ skyRulings: 'galactic' });
  });

  it('at the defaults, Reset and Copy are both disabled', () => {
    renderSection();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Copy changed values' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('once a knob moved, Reset fires and Copy is offered', () => {
    const { onReset } = renderSection({
      ...ANTIQUE_TUNING_DEFAULTS,
      inkGain: 1.5,
      rows: { ...ANTIQUE_TUNING_DEFAULTS.rows, web: false },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Copy changed values' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});
