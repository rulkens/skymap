/**
 * The id `faceViewSpec` mints and the one `timedSlotRowsOf` rebuilds are the
 * same string — pinned here because nothing else compares the two sites.
 */

import { describe, it, expect } from 'vitest';

import { captureFaceViewId } from '../../../src/utils/camera/captureFaceViewId';
import { faceViewSpec } from '../../../src/utils/camera/faceViewSpec';

describe('captureFaceViewId', () => {
  it('joins capture key and face with a colon', () => {
    expect(captureFaceViewId('sgrAStar', 3)).toBe('sgrAStar:3');
  });

  it('is the id a face view spec carries', () => {
    expect(faceViewSpec('probe', 5, 512, 0).id).toBe(captureFaceViewId('probe', 5));
  });
});
