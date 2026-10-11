import { describe, it, expect } from 'vitest';
import { dockTimeLabel } from '../../../src/utils/time/dockTimeLabel';

const MARCH_2031 = new Date(Date.UTC(2031, 2, 3, 23, 59));

describe('dockTimeLabel', () => {
  it('reads just "Time" on real time, whatever the instant or pause flag', () => {
    expect(dockTimeLabel({ mode: 'live', paused: false }, MARCH_2031)).toEqual({
      text: 'Time',
      glyph: null,
    });
    expect(dockTimeLabel({ mode: 'live', paused: true }, MARCH_2031).glyph).toBeNull();
  });

  it('shows the UTC date without zero padding and a play glyph while running', () => {
    expect(dockTimeLabel({ mode: 'manual', paused: false }, MARCH_2031)).toEqual({
      text: '3 Mar 2031',
      glyph: '▶',
    });
  });

  it('shows the pause glyph while paused', () => {
    expect(dockTimeLabel({ mode: 'manual', paused: true }, MARCH_2031).glyph).toBe('❚❚');
  });
});
