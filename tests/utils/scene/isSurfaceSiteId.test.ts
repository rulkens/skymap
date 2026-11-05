import { describe, it, expect } from 'vitest';

import { isSurfaceSiteId } from '../../../src/utils/scene/isSurfaceSiteId';

describe('isSurfaceSiteId', () => {
  it('accepts a real SURFACE_FIXED_SITES id', () => {
    expect(isSurfaceSiteId('curiosity')).toBe(true);
  });

  it('rejects an id outside SURFACE_FIXED_SITES', () => {
    expect(isSurfaceSiteId('not-a-site')).toBe(false);
  });
});
