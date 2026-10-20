import { describe, expect, it } from 'vitest';

import { emphasisOf } from '../../../../src/services/engine/presentation/emphasisOf';
import { MILD_RECESSION } from '../../../../src/data/mildRecession';
import { STRONG_RECESSION } from '../../../../src/data/strongRecession';

const FOCUS = 42;
const atFullFocus = { focusBlend: 1, focusPickId: FOCUS };

describe('emphasisOf', () => {
  it('the focused subject keeps full emphasis', () => {
    expect(emphasisOf({ recession: 'mild' }, atFullFocus, FOCUS)).toBe(1);
  });

  it('every other record recedes by its entry', () => {
    expect(emphasisOf({ recession: 'mild' }, atFullFocus, 7)).toBeCloseTo(MILD_RECESSION);
    expect(emphasisOf({ recession: 'mild' }, atFullFocus)).toBeCloseTo(MILD_RECESSION);
    expect(emphasisOf({ recession: 'strong' }, atFullFocus)).toBeCloseTo(STRONG_RECESSION);
    expect(emphasisOf({}, atFullFocus, 7)).toBe(1);
  });

  it('no focus matches no record', () => {
    const value = emphasisOf({ recession: 'mild' }, { focusBlend: 0.5, focusPickId: null });
    expect(value).toBeCloseTo(1 + (MILD_RECESSION - 1) * 0.5);
  });
});
