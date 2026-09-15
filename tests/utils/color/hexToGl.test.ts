import { describe, expect, it } from 'vitest';
import { hexToGl } from '../../../src/utils/color/hexToGl';

describe('hexToGl', () => {
  it('parses pure red #FF0000 as [1,0,0,1]', () => {
    expect(hexToGl('#FF0000')).toEqual([1, 0, 0, 1]);
  });

  it('defaults alpha to 1 for the 6-char form', () => {
    expect(hexToGl('#336699')[3]).toBe(1);
  });

  it('reads alpha from the 8-char form', () => {
    // #FF000080 → red at 0x80/0xFF = 128/255 alpha
    const [r, g, b, a] = hexToGl('#FF000080');
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBeCloseTo(128 / 255);
  });

  it('throws on a wrong-length hex (#RGB short form not supported)', () => {
    // Cast through HexString — the type accepts `#${string}` so the
    // runtime check is the real gate.  Test exists precisely because
    // the type can't reject this.
    expect(() => hexToGl('#FFF' as `#${string}`)).toThrow(/expected/);
  });

  it('throws on a non-hex character', () => {
    expect(() => hexToGl('#FFGG00' as `#${string}`)).toThrow(/non-hex/);
  });
});
