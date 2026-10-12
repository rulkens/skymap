import { describe, it, expect } from 'vitest';
import { dockTimeLabel } from '../../../src/utils/time/dockTimeLabel';

const MARCH_2031 = new Date(Date.UTC(2031, 2, 3, 23, 59));

describe('dockTimeLabel', () => {
  it('reads just "Time" on running real time', () => {
    expect(dockTimeLabel({ mode: 'live', paused: false }, MARCH_2031, 2031)).toEqual({
      text: 'Time',
      glyph: null,
      name: 'Time',
    });
  });

  // Pausing keeps mode 'live'; the dock must still show the clock is frozen.
  it('shows the pause glyph on a paused live clock', () => {
    const label = dockTimeLabel({ mode: 'live', paused: true }, MARCH_2031, 2031);
    expect(label.glyph).toBe('❚❚');
    expect(label.text).toBe('3 Mar');
  });

  it('shows the UTC day and month without zero padding, with a play glyph while running', () => {
    expect(dockTimeLabel({ mode: 'manual', paused: false }, MARCH_2031, 2031)).toMatchObject({
      text: '3 Mar',
      glyph: '▶',
    });
  });

  it('keeps the year only when it is not the current one, and always in the accessible name', () => {
    const away = dockTimeLabel({ mode: 'manual', paused: true }, MARCH_2031, 2026);
    expect(away.text).toBe('3 Mar 2031');
    expect(away.name).toBe('Time, 3 Mar 2031, paused');
    expect(dockTimeLabel({ mode: 'manual', paused: false }, MARCH_2031, 2031).name).toBe(
      'Time, 3 Mar 2031, running',
    );
  });
});
