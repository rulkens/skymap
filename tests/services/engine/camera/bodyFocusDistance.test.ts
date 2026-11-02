import { describe, it, expect } from 'vitest';
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';

describe('bodyFocusDistance', () => {
  it('fits by width in a portrait window', () => {
    expect(bodyFocusDistance(1, { tanHalfX: 0.3, tanHalfY: 0.6 })).toBe(
      bodyFocusDistance(1, { tanHalfX: 0.3, tanHalfY: 0.3 }),
    );
  });
});
