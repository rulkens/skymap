// @vitest-environment jsdom

/**
 * FocusMovesTuningSection — the unit seam for the seconds-on-screen, ms-in-store
 * conversion (a ×1000 slip would otherwise ship silently) and the ease list's
 * monotone-only promise (an overshoot ease flies the camera through its target).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import FocusMovesTuningSection from '../../../src/components/DebugPanel/FocusMovesTuningSection/FocusMovesTuningSection';
import { DEFAULT_FOCUS_MOVES } from '../../../src/data/camera/focusMoveDefaults';

function renderSection() {
  const onEasedDurationChange = vi.fn<(ms: number) => void>();
  const onGeodesicChange = vi.fn();
  const view = render(
    <FocusMovesTuningSection
      moves={DEFAULT_FOCUS_MOVES}
      onEasedDurationChange={onEasedDurationChange}
      onGeodesicChange={onGeodesicChange}
    />,
  );
  return { ...view, onEasedDurationChange, onGeodesicChange };
}

describe('FocusMovesTuningSection', () => {
  it('dragging the eased duration dispatches milliseconds', () => {
    const { container, onEasedDurationChange } = renderSection();
    const first = container.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(first.value).toBe('0.6');
    fireEvent.change(first, { target: { value: '1.5' } });
    expect(onEasedDurationChange).toHaveBeenCalledExactlyOnceWith(1500);
  });

  it('dragging a geodesic duration dispatches milliseconds', () => {
    const { container, onGeodesicChange } = renderSection();
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type=range]');
    fireEvent.change(inputs[4]!, { target: { value: '3' } });
    expect(onGeodesicChange).toHaveBeenCalledExactlyOnceWith({ maxMs: 3000 });
  });

  it('the ease select offers no overshoot or bounce eases', () => {
    const { container } = renderSection();
    const options = [...container.querySelectorAll('select option')].map((o) => o.textContent);
    expect(options.length).toBeGreaterThan(10);
    expect(options).toContain('easeOutQuint');
    expect(options.filter((o) => /Back|Elastic|Bounce/.test(o ?? ''))).toEqual([]);
  });
});
