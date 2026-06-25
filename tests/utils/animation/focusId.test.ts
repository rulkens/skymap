import { describe, it, expect } from 'vitest';
import { focusId } from '../../../src/utils/animation/focusId';

describe('focusId', () => {
  it('focusId returns a value assignable to string', () => {
    // The FocusId brand is purely a type-system guard at the authoring boundary.
    // At runtime, the branded value is indistinguishable from the original string —
    // it survives the round-trip with identity, no wrapping. The brand only exists
    // to prevent raw strings from accidentally flowing into tour/clip authoring
    // surfaces where we want to prove the identifier came through validation.
    const id = focusId('m87');
    const str: string = id;
    expect(str).toBe('m87');
  });
});
