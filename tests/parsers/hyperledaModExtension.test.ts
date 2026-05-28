import { describe, it, expect } from 'vitest';
import { parseHyperLedaCsv } from '../../tools/parsers/glade';

describe('parseHyperLedaCsv with mod0 columns', () => {
  it('parses the v2 header containing mod0,e_mod0 and exposes per-row distance modulus', () => {
    const csv =
      'pgc,pa,logr25,logd25,e_logd25,mod0,e_mod0\n' +
      '2789,123.4,0.32,1.18,0.05,27.31,0.15\n' +
      // Empty mod0 cells should surface as NaN, not 0.
      '5364,42.0,0.10,0.50,0.02,,\n';
    const map = parseHyperLedaCsv(csv);
    const a = map.get('2789');
    expect(a).toBeDefined();
    expect(a!.mod0).toBeCloseTo(27.31, 5);
    expect(a!.e_mod0).toBeCloseTo(0.15, 5);
    const b = map.get('5364');
    expect(b).toBeDefined();
    expect(Number.isNaN(b!.mod0)).toBe(true);
    expect(Number.isNaN(b!.e_mod0)).toBe(true);
  });

  it('rejects the v1 header without mod0 columns', () => {
    const csv = 'pgc,pa,logr25,logd25,e_logd25\n2789,123.4,0.32,1.18,0.05\n';
    expect(() => parseHyperLedaCsv(csv)).toThrow(/mod0/);
  });
});
