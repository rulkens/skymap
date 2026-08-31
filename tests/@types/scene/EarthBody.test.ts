import { describe, it, expect } from 'vitest';

import type { EarthBody } from '../../../src/@types/scene/EarthBody';

describe('EarthBody type', () => {
  it('accepts an object literal of the identity-only shape', () => {
    // Position + orientation are no longer on the record — they are derived per
    // sim-instant by `deriveBodyStates`, so the record carries identity alone.
    const earth: EarthBody = {
      id: 'earth',
      label: 'Earth',
      radiusM: 6371000,
    };
    expect(earth.radiusM).toBe(6371000);
  });
});
