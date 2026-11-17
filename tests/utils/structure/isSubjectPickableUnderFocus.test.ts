import { describe, it, expect } from 'vitest';

import { isSubjectPickableUnderFocus } from '../../../src/utils/structure/isSubjectPickableUnderFocus';
import { RECEDE_ALL_FOCUS_SPHERE } from '../../../src/data/selection/recedeAllFocusSphere';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// A sphere holding nothing, fully faded in: only the exemption can make a subject pickable.
const FOCUS = { ...RECEDE_ALL_FOCUS_SPHERE, blend: 1 };
const SUBJECT_POS: Vec3 = [0.01, 0, 0];

describe('isSubjectPickableUnderFocus', () => {
  it('keeps the focused subject pickable outside its own sphere', () => {
    expect(isSubjectPickableUnderFocus(7, SUBJECT_POS, { focus: FOCUS, focusPickId: 7 })).toBe(
      true,
    );
  });

  it('leaves any other subject outside the sphere unpickable', () => {
    expect(isSubjectPickableUnderFocus(8, SUBJECT_POS, { focus: FOCUS, focusPickId: 7 })).toBe(
      false,
    );
    expect(isSubjectPickableUnderFocus(8, SUBJECT_POS, { focus: FOCUS, focusPickId: null })).toBe(
      false,
    );
  });
});
