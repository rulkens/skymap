import { describe, expect, it } from 'vitest';

import { DOME_TILT_DEG } from '../../../packages/website/src/content/pages/domes/domes.data';
import { DOME_PARAMS } from '../../../src/data/rendering/domeParams';

// The Domes page draws the circle at the focus's height from its copy of the tilt.
describe('the Domes page’s dome tilt', () => {
  it('is the app’s', () => {
    expect(DOME_TILT_DEG).toBe(DOME_PARAMS.tiltDeg);
  });
});
