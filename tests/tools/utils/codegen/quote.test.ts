import { describe, it, expect } from 'vitest';
import { quote } from '../../../../tools/utils/codegen/quote';

describe('quote', () => {
  it('falls back to a JSON double-quoted literal when the string carries a quote or a backslash', () => {
    expect(quote("Tycho's")).toBe('"Tycho\'s"');
    expect(quote('a\\b')).toBe('"a\\\\b"');
    expect(quote('plain')).toBe("'plain'");
  });
});
