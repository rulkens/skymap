import { describe, expect, it } from 'vitest';
import { CAPTURE_HIDDEN_PASSES } from '../../../../tools/utils/capture/hiddenPasses';
import { FRAME_ORDER_PASS_NAMES } from '../../../../src/services/engine/frame/frameOrderPassNames';

describe('CAPTURE_HIDDEN_PASSES', () => {
  // Core's and every Layer's passes alike: a Layer's pass exists only after
  // boot, but its name is authored on a FRAME_ORDER line.
  it('every pass the capture hides is a pass a FRAME_ORDER line draws', () => {
    for (const hidden of CAPTURE_HIDDEN_PASSES) {
      expect(FRAME_ORDER_PASS_NAMES).toContain(hidden);
    }
  });
});
