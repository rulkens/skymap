/**
 * cameraFraming — unit test for the eye-tuned bearing constant. The clip
 * planes and FOV default are plain re-exported numbers, not worth a test.
 */

import { describe, it, expect } from 'vitest';

import { GALACTIC_DISC_FORWARD } from '../../../../src/services/engine/camera/cameraFraming';
import { orbitAnglesLookingAlong } from '../../../../src/utils/camera/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';

describe('GALACTIC_DISC_FORWARD', () => {
  it('decodes through the ecliptic frame to the legacy eye-tuned bearing', () => {
    // Pins the relationship between the two modules: GALACTIC_DISC_FORWARD is
    // a WORLD vector, but it must still decode — under the frame it was
    // derived from — to the exact yaw/pitch the tour's opening/closing beats
    // used before they switched to aimAlong. A mistyped digit in either
    // GALACTIC_DISC_FORWARD or this expectation would fail this test; nothing
    // else in the suite pins the value (resolveClipFoci's cross-basis test
    // uses it only as an arbitrary direction).
    const { yaw, pitch } = orbitAnglesLookingAlong(
      GALACTIC_DISC_FORWARD,
      ORIENTATION_FRAMES.ecliptic,
    );
    // 4 places, not 6: the exact J2000 obliquity re-tilts the ecliptic frame by
    // ~2e-6 rad, still well inside a mistyped fourth decimal.
    expect(yaw).toBeCloseTo(-1.4208, 4);
    expect(pitch).toBeCloseTo(-0.1783, 4);
  });
});
