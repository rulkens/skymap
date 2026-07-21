// @vitest-environment jsdom
//
// TimeBar presentational tests.
//
// TimeBar is a pure instrument: state in via props, intent out via callbacks.
// These tests pin the observable behaviour the container (Task 3) depends on —
// the three transport callbacks fire from their buttons, the "now" affordance
// is manual-mode-only, the readout is clickable, and the play/pause control
// reflects `paused`. The live-mode hover collapse is pure CSS (`:hover` /
// `:focus-within` on .root), so jsdom can't observe the reveal; it isn't tested
// here — only the logic that jsdom can see.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import TimeBar, { type TimeBarProps } from '../../../src/components/TimeBar/TimeBar';

function renderBar(overrides: Partial<TimeBarProps> = {}) {
  const props: TimeBarProps = {
    readout: '2026-11-03 18:00 UTC',
    rateLabel: '1 day/s',
    mode: 'manual',
    paused: false,
    onSlower: vi.fn<() => void>(),
    onFaster: vi.fn<() => void>(),
    onPlayPause: vi.fn<() => void>(),
    onNow: vi.fn<() => void>(),
    onReadoutClick: vi.fn<() => void>(),
    ...overrides,
  };
  render(<TimeBar {...props} />);
  return props;
}

describe('TimeBar', () => {
  it('fires onFaster/onSlower/onPlayPause on the step buttons', () => {
    const props = renderBar();

    fireEvent.click(screen.getByRole('button', { name: /slower/i }));
    expect(props.onSlower).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /faster/i }));
    expect(props.onFaster).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('shows the now button only in manual mode', () => {
    renderBar({ mode: 'live' });
    expect(screen.queryByRole('button', { name: /now/i })).toBeNull();

    renderBar({ mode: 'manual' });
    expect(screen.getByRole('button', { name: /now/i })).not.toBeNull();
  });

  it('renders the readout and fires onReadoutClick', () => {
    const props = renderBar({ readout: '2026-11-03 18:00 UTC' });
    const readout = screen.getByRole('button', { name: /2026-11-03 18:00 UTC/i });
    fireEvent.click(readout);
    expect(props.onReadoutClick).toHaveBeenCalledTimes(1);
  });

  it('reflects paused state on the play/pause control', () => {
    renderBar({ paused: false });
    const pauseBtn = screen.getByRole('button', { name: /pause/i });
    expect(pauseBtn.getAttribute('aria-pressed')).toBe('true');

    renderBar({ paused: true });
    const playBtn = screen.getByRole('button', { name: /play/i });
    expect(playBtn.getAttribute('aria-pressed')).toBe('false');
  });
});
