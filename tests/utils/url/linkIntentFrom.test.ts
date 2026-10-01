import { describe, it, expect } from 'vitest';

import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { encodeFramedPose } from '../../../src/utils/url/encodeFramedPose';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';

const POSE: FramedCameraPose = {
  frame: 'absolute',
  pose: { target: [1, 2, 3], yaw: 0.7, pitch: -0.2, distance: 5.5, roll: 0.42 },
};
const J2000_ISO = '2000-01-01T12:00:00.000Z';

describe('linkIntentFrom', () => {
  it('linkIntentFrom parses each key', () => {
    expect(linkIntentFrom('focus=m31')).toEqual({ view: { kind: 'focus', id: 'm31' } });
    expect(linkIntentFrom(`pose=${encodeFramedPose(POSE)}`)).toEqual({
      view: { kind: 'pose', pose: POSE },
    });
    expect(linkIntentFrom(`t=${J2000_ISO}&orientation=galactic`)).toEqual({
      view: { kind: 'home' },
      t: Date.UTC(2000, 0, 1, 12),
      orientation: 'galactic',
    });
  });

  it('focus and pose combine into one focus view', () => {
    // Either order on the URL: precedence is the parse rule's, not the table's.
    const expected = { view: { kind: 'focus', id: 'm31', pose: POSE } };
    expect(linkIntentFrom(`focus=m31&pose=${encodeFramedPose(POSE)}`)).toEqual(expected);
    expect(linkIntentFrom(`pose=${encodeFramedPose(POSE)}&focus=m31`)).toEqual(expected);
  });

  it('no hash yields the home view', () => {
    expect(linkIntentFrom('')).toEqual({ view: { kind: 'home' } });
    // An empty value says nothing, so it never reaches a row's read.
    expect(linkIntentFrom('focus=')).toEqual({ view: { kind: 'home' } });
  });
});
