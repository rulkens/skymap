import { describe, it, expect } from 'vitest';

import { parseFocusMoveStyle } from '../../../src/utils/storage/parseFocusMoveStyle';
import { FOCUS_MOVE_STYLE } from '../../../src/state/persistedValues';
import type { FocusMoveStyle } from '../../../src/@types/camera/FocusMoveStyle';

describe('parseFocusMoveStyle', () => {
  it('round-trips both styles and rejects garbage', () => {
    for (const style of ['eased', 'geodesic'] satisfies FocusMoveStyle[]) {
      expect(parseFocusMoveStyle(FOCUS_MOVE_STYLE.serialize(style))).toBe(style);
    }
    // 'glide' is #531's retired name; a prototype key must not pass the own-key check.
    for (const raw of ['glide', '', '"eased"', 'toString', 'Eased']) {
      expect(parseFocusMoveStyle(raw)).toBeNull();
    }
  });
});
