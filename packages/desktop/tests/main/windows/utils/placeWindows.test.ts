import { describe, expect, it } from 'vitest';
import type { DisplayInfo } from '../../../../src/@types/DisplayInfo';
import { placeWindows } from '../../../../src/main/windows/utils/placeWindows';

const laptop: DisplayInfo = {
  id: 1,
  number: 1,
  label: '',
  width: 2880,
  height: 1800,
  primary: true,
};
const projector: DisplayInfo = {
  id: 7,
  number: 2,
  label: '',
  width: 4096,
  height: 2160,
  primary: false,
};
const twin: DisplayInfo = {
  id: 8,
  number: 3,
  label: '',
  width: 4096,
  height: 2160,
  primary: false,
};
const storedProjector = { id: 7, width: 4096, height: 2160 };

describe('placeWindows', () => {
  it('sky takes the stored display by id', () => {
    expect(placeWindows(storedProjector, [laptop, projector])?.sky).toBe(projector);
  });

  it('sky takes the display of the stored size when the id changed', () => {
    const replugged = { ...projector, id: 12 };
    expect(placeWindows(storedProjector, [laptop, replugged])).toMatchObject({
      sky: replugged,
      storedMissing: false,
    });
  });

  // Audit B I13: the page's own copy of this rule counted any same-size display as found.
  it('two displays of the stored size fall back to the primary, and say the stored one is missing', () => {
    const stored = { ...storedProjector, id: 99 };
    expect(placeWindows(stored, [twin, laptop, projector])).toMatchObject({
      sky: laptop,
      storedMissing: true,
    });
  });

  it('a missing stored display falls back to the primary; nothing stored is never missing', () => {
    expect(placeWindows(storedProjector, [laptop])).toMatchObject({
      sky: laptop,
      storedMissing: true,
    });
    expect(placeWindows(null, [projector, laptop])).toMatchObject({
      sky: laptop,
      storedMissing: false,
    });
  });

  it('control takes a display the sky does not use, and is null on a single screen', () => {
    expect(placeWindows(storedProjector, [laptop, projector])?.control).toBe(laptop);
    expect(placeWindows(storedProjector, [laptop])?.control).toBeNull();
  });

  it('is null with no displays instead of throwing', () => {
    expect(placeWindows(storedProjector, [])).toBeNull();
  });
});
