import { describe, expect, it } from 'vitest';
import type { DisplayInfo } from '../../src/@types/DisplayInfo';
import { placeWindows } from '../../src/main/placeWindows';

const laptop: DisplayInfo = { id: 1, width: 2880, height: 1800, primary: true };
const projector: DisplayInfo = { id: 7, width: 4096, height: 2160, primary: false };
const twin: DisplayInfo = { id: 8, width: 4096, height: 2160, primary: false };
const storedProjector = { id: 7, width: 4096, height: 2160 };

describe('placeWindows', () => {
  it('sky takes the stored display by id', () => {
    expect(placeWindows(storedProjector, [laptop, projector]).sky).toBe(projector);
  });

  it('sky takes the display of the stored size when the id changed', () => {
    const replugged = { ...projector, id: 12 };
    expect(placeWindows(storedProjector, [laptop, replugged]).sky).toBe(replugged);
  });

  it('two displays of the stored size fall back to the primary', () => {
    const stored = { ...storedProjector, id: 99 };
    expect(placeWindows(stored, [twin, laptop, projector]).sky).toBe(laptop);
  });

  it('a missing stored display falls back to the primary', () => {
    expect(placeWindows(storedProjector, [laptop]).sky).toBe(laptop);
    expect(placeWindows(null, [projector, laptop]).sky).toBe(laptop);
  });

  it('control takes a display the sky does not use', () => {
    expect(placeWindows(storedProjector, [laptop, projector])).toEqual({
      sky: projector,
      control: laptop,
    });
  });

  it('control is null on a single screen', () => {
    expect(placeWindows(storedProjector, [laptop]).control).toBeNull();
  });
});
