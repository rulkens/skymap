import { describe, expect, it } from 'vitest';
import { parseSkyWindowState } from '../../../../src/main/windows/utils/parseSkyWindowState';

describe('parseSkyWindowState', () => {
  it('reads a window left windowed, with its bounds', () => {
    const bounds = { x: 10, y: 20, width: 800, height: 600 };
    expect(parseSkyWindowState({ full: false, bounds })).toEqual({ full: false, bounds });
  });

  // A first launch, or a file cut short by a power loss, must start the show filling its screen.
  it('starts full screen when the file is missing or damaged', () => {
    expect(parseSkyWindowState(null)).toEqual({ full: true, bounds: null });
    expect(parseSkyWindowState('nonsense')).toEqual({ full: true, bounds: null });
    expect(parseSkyWindowState({ full: 'no', bounds: { x: 1 } })).toEqual({
      full: true,
      bounds: null,
    });
  });
});
