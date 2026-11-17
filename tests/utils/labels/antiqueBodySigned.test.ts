import { describe, expect, it } from 'vitest';
import { antiqueBodySigned } from '../../../src/utils/labels/antiqueBodySigned';

describe('antiqueBodySigned', () => {
  it('signs the bodies the plate names, not the ones it hides', () => {
    expect(antiqueBodySigned('earth')).toBe(true);
    expect(antiqueBodySigned('jupiter')).toBe(true);
    expect(antiqueBodySigned('bennu')).toBe(false);
  });
});
