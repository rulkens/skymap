// @vitest-environment jsdom
//
// DateEntryPopover presentational tests.
//
// The popover is a pure instrument: it seeds a native datetime-local input from
// the current sim instant and emits the typed instant (interpreted as UTC) back
// out. These tests pin the two observable behaviours the container depends on —
// committing parses the input as UTC and hands back the matching Date, and Esc
// (or a click outside) cancels without committing.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import DateEntryPopover, {
  type DateEntryPopoverProps,
} from '../../../src/components/TimeBar/DateEntryPopover/DateEntryPopover';

function renderPopover(overrides: Partial<DateEntryPopoverProps> = {}) {
  const props: DateEntryPopoverProps = {
    initial: new Date(Date.UTC(2026, 10, 3, 18, 0)),
    onCommit: vi.fn<(instant: Date) => void>(),
    onCancel: vi.fn<() => void>(),
    ...overrides,
  };
  render(<DateEntryPopover {...props} />);
  return props;
}

describe('DateEntryPopover', () => {
  it('commits the parsed instant', () => {
    const props = renderPopover();
    const input = screen.getByLabelText(/date and time \(utc\)/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2027-03-14T09:26' } });
    fireEvent.click(screen.getByRole('button', { name: /set/i }));

    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCommit).toHaveBeenCalledWith(new Date(Date.UTC(2027, 2, 14, 9, 26)));
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('commits on Enter', () => {
    const props = renderPopover();
    const input = screen.getByLabelText(/date and time \(utc\)/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2027-03-14T09:26' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(props.onCommit).toHaveBeenCalledWith(new Date(Date.UTC(2027, 2, 14, 9, 26)));
  });

  it('does not commit a blank input on Set', () => {
    const props = renderPopover();
    const input = screen.getByLabelText(/date and time \(utc\)/i) as HTMLInputElement;

    // Clearing to blank makes the value unparseable; Set must no-op rather than
    // hand back an Invalid Date. Cancel isn't fired either — the popover stays open.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /set/i }));

    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('fills the input with the current instant (UTC) without committing', () => {
    // A fixed wall clock lets us assert the exact filled string. If the fill
    // formatted from local getters or grabbed the wrong instant this would drift.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2027, 2, 14, 9, 26)));
    try {
      const props = renderPopover();
      const input = screen.getByLabelText(/date and time \(utc\)/i) as HTMLInputElement;

      fireEvent.click(screen.getByRole('button', { name: /fill with current time/i }));

      expect(input.value).toBe('2027-03-14T09:26');
      expect(props.onCommit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels on Esc', () => {
    const props = renderPopover();
    const input = screen.getByLabelText(/date and time \(utc\)/i);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it('cancels on a click outside the panel', () => {
    const props = renderPopover();

    fireEvent.mouseDown(document.body);

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();
  });
});
