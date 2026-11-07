import { describe, expect, it } from 'vitest';
import { windowBounds } from '../../../../src/main/windows/utils/windowBounds';

const laptop = { x: 0, y: 25, width: 1440, height: 875 };
const projector = { x: 1440, y: 0, width: 1920, height: 1080 };

describe('windowBounds', () => {
  it('puts the window back where it was while its top edge is on a screen', () => {
    const left = { x: 1600, y: 100, width: 800, height: 600 };
    expect(windowBounds(left, [laptop, projector], laptop)).toEqual(left);
  });

  // The projector it sat on is off; a window nobody can grab by its top edge would be stuck.
  it('falls back to three quarters of the home screen when it would be out of reach', () => {
    const fallback = { x: 180, y: 134, width: 1080, height: 656 };
    expect(windowBounds({ x: 1600, y: 100, width: 800, height: 600 }, [laptop], laptop)).toEqual(
      fallback,
    );
    expect(windowBounds({ x: 100, y: -400, width: 800, height: 600 }, [laptop], laptop)).toEqual(
      fallback,
    );
    expect(windowBounds(null, [laptop], laptop)).toEqual(fallback);
  });
});
