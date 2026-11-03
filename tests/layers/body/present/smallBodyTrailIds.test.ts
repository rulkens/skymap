import { describe, expect, it } from 'vitest';

import { SMALL_BODY_TRAIL_IDS } from '../../../../src/layers/body/present/smallBodyTrailIds';

// An empty list would leave every small-body trail always on, and nothing else would notice.
describe('SMALL_BODY_TRAIL_IDS', () => {
  it('names every small body', () => {
    expect(SMALL_BODY_TRAIL_IDS).toEqual(['vesta', 'ceres', 'bennu']);
  });
});
