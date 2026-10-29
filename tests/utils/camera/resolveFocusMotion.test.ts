import { describe, it, expect } from 'vitest';

import { resolveFocusMotion } from '../../../src/utils/camera/resolveFocusMotion';
import { DEFAULT_FOCUS_MOVES } from '../../../src/data/camera/focusMoveDefaults';
import type { FocusMoveSettings } from '../../../src/@types/settings/FocusMoveSettings';

describe('resolveFocusMotion', () => {
  it('maps each style to its arm, copying the eased duration and the whole geodesic record', () => {
    const settings: FocusMoveSettings = {
      ...DEFAULT_FOCUS_MOVES,
      eased: { durationMs: 900 },
      geodesic: { ...DEFAULT_FOCUS_MOVES.geodesic, rho: 0.3, ease: 'linear' },
    };

    expect(resolveFocusMotion({ ...settings, style: 'eased' }, 0.8)).toEqual({
      style: 'eased',
      durationMs: 900,
      ease: 'easeOutCubic',
    });
    expect(resolveFocusMotion({ ...settings, style: 'geodesic' }, 0.8)).toEqual({
      style: 'geodesic',
      tuning: settings.geodesic,
      fovYRad: 0.8,
    });
  });
});
