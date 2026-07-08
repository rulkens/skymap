import { describe, expect, it } from 'vitest';
import { parseSize } from '../../../../tools/utils/record/parseSize';

describe('parseSize', () => {
  it('parseSize parses WxH', () => {
    expect(parseSize('3840x2160')).toEqual({ width: 3840, height: 2160 });
  });

  it('parseSize throws on malformed or non-positive input', () => {
    expect(() => parseSize('3840X2160')).toThrow(/3840X2160/); // uppercase separator rejected
    expect(() => parseSize('3840,2160')).toThrow(/3840,2160/);
    expect(() => parseSize('0x2160')).toThrow(/0x2160/);
    expect(() => parseSize('3840x0')).toThrow(/3840x0/);
    expect(() => parseSize('3840x-2160')).toThrow(/3840x-2160/);
  });
});
