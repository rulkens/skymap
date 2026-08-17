import { describe, it, expect } from 'vitest';
import { isOrientationFrameId } from '../../../src/utils/url/isOrientationFrameId';

describe('isOrientationFrameId', () => {
  it('accepts the four frame ids and rejects others', () => {
    // Guards the URL `orientation` read against a hand-typed junk value — a
    // classifier over external input, not a restatement of the registry.
    expect(isOrientationFrameId('galactic')).toBe(true);
    expect(isOrientationFrameId('ecliptic')).toBe(true);
    expect(isOrientationFrameId('')).toBe(false);
    expect(isOrientationFrameId('polaris')).toBe(false);
  });
});
