// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TimeSection from '../../../src/components/RemotePage/TimeSection/TimeSection';
import type { RemoteCommand } from '../../../src/@types/remote/RemoteCommand';
import type { TimeState } from '../../../src/@types/time/TimeState';

const LIVE: TimeState = {
  mode: 'live',
  anchor: { simDays: 2_460_384.5, realMs: 0 },
  rateIndex: 0,
  direction: 1,
  paused: false,
  profile: null,
};

function renderSection(patch: Partial<TimeState> = {}) {
  const onCommand = vi.fn<(command: RemoteCommand) => void>();
  render(<TimeSection clock={{ ...LIVE, ...patch }} onCommand={onCommand} />);
  return onCommand;
}

describe('TimeSection', () => {
  it.each([
    [{}, 'Real time'],
    [{ paused: true }, 'Paused'],
    [{ mode: 'manual', rateIndex: 6 }, '1 day/s'],
    [{ mode: 'manual', rateIndex: 4, direction: -1 }, '1 hr/s, backward'],
    [{ mode: 'manual', rateIndex: 4, direction: -1, paused: true }, 'Paused'],
  ] as const)('the state line for %o reads %s', (patch, text) => {
    renderSection(patch);
    expect(screen.getByRole('status').textContent).toBe(text);
  });

  it('Back to now is hidden while the clock runs in real time', () => {
    renderSection();
    expect(screen.queryByRole('button', { name: 'Back to now' })).toBeNull();
  });

  it.each([{ paused: true }, { mode: 'manual' }] as const)(
    'Back to now shows when %o, and sends timeGoLive',
    (patch) => {
      const onCommand = renderSection(patch);
      fireEvent.click(screen.getByRole('button', { name: 'Back to now' }));
      expect(onCommand).toHaveBeenCalledWith({ name: 'timeGoLive', payload: null });
    },
  );

  it('the speed list marks the current speed; a pick sets the rate and closes the list', () => {
    const onCommand = renderSection({ mode: 'manual', rateIndex: 3 });
    const speed = screen.getByRole('button', { name: 'Speed 10 min/s' });
    fireEvent.click(speed);
    const list = screen.getByRole('list', { name: 'Speeds' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.textContent)[0]).toBe('10 yr/s');
    expect(rows.filter((row) => row.getAttribute('aria-current'))).toHaveLength(1);
    expect(
      within(list).getByRole('button', { name: '10 min/s' }).getAttribute('aria-current'),
    ).toBe('true');
    fireEvent.click(within(list).getByRole('button', { name: '1 yr/s' }));
    expect(onCommand).toHaveBeenCalledWith({ name: 'timeSetRate', payload: { rateIndex: 12 } });
    expect(screen.queryByRole('list', { name: 'Speeds' })).toBeNull();
    expect(document.activeElement).toBe(speed);
  });

  it('Reverse is pressed while running backward, and flips the direction', () => {
    const onCommand = renderSection({ mode: 'manual', direction: -1 });
    const reverse = screen.getByRole('button', { name: 'Reverse' });
    expect(reverse.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(reverse);
    expect(onCommand).toHaveBeenCalledWith({ name: 'timeSetDirection', payload: { direction: 1 } });
  });

  it('Set sends the typed instant as UTC, time of day included', () => {
    const onCommand = renderSection();
    fireEvent.change(screen.getByLabelText('Set date and time (UTC)'), {
      target: { value: '2024-03-15T18:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    const [command] = onCommand.mock.calls.at(-1)!;
    expect(command.name).toBe('timeSetDate');
    // 2024-03-15T00:00Z is JD 2460384.5; 18:30 is 18.5 / 24 of a day on.
    expect((command.payload as { simDays: number }).simDays).toBeCloseTo(2_460_385.2708333, 6);
  });
});
