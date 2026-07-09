import { describe, expect, it } from 'vitest';
import { parseBeatRange } from '../../../../tools/utils/record/parseBeatRange';

describe('parseBeatRange', () => {
  it("parseBeatRange parses 'a..b' inclusive", () => {
    expect(parseBeatRange('4..6')).toEqual({ from: 4, to: 6 });
  });

  it('parseBeatRange parses a single index as a one-beat range', () => {
    expect(parseBeatRange('4')).toEqual({ from: 4, to: 4 });
  });

  it('parseBeatRange throws on reversed, negative, and malformed input', () => {
    expect(() => parseBeatRange('6..4')).toThrow(/6\.\.4/);
    expect(() => parseBeatRange('-1')).toThrow(/-1/);
    expect(() => parseBeatRange('4.5')).toThrow(/4\.5/);
    expect(() => parseBeatRange('')).toThrow(/parseBeatRange/);
    expect(() => parseBeatRange('abc')).toThrow(/abc/);
  });
});
