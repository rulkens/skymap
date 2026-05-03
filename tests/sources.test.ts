import { describe, it, expect } from 'vitest';
import {
  Source,
  sourceLabel,
  sourceIsAllSky,
  sourceMaxDistanceMpc,
  ALL_VISIBLE_MASK,
  maskHas,
  maskWith,
  maskWithout,
} from '../src/data/sources';

describe('Source enum', () => {
  it('has stable numeric values used in the binary format', () => {
    expect(Source.Synthetic).toBe(0);
    expect(Source.SDSS).toBe(1);
    expect(Source.TwoMRS).toBe(2);
    expect(Source.TwoMPZ).toBe(3);
    expect(Source.SixDFGS).toBe(4);
  });
});

describe('sourceLabel', () => {
  it('returns human-readable names', () => {
    expect(sourceLabel(Source.SDSS)).toBe('SDSS');
    expect(sourceLabel(Source.TwoMRS)).toBe('2MRS');
    expect(sourceLabel(Source.TwoMPZ)).toBe('2MPZ');
    expect(sourceLabel(Source.SixDFGS)).toBe('6dFGS');
    expect(sourceLabel(Source.Synthetic)).toBe('Synthetic');
  });
});

describe('source coverage metadata', () => {
  it('flags all-sky sources', () => {
    expect(sourceIsAllSky(Source.TwoMRS)).toBe(true);
    expect(sourceIsAllSky(Source.TwoMPZ)).toBe(true);
    expect(sourceIsAllSky(Source.SDSS)).toBe(false);
    expect(sourceIsAllSky(Source.SixDFGS)).toBe(false);
  });
  it('reports approximate maximum distance per survey in Mpc', () => {
    expect(sourceMaxDistanceMpc(Source.TwoMRS)).toBeLessThan(300);
    expect(sourceMaxDistanceMpc(Source.TwoMPZ)).toBeLessThan(700);
    expect(sourceMaxDistanceMpc(Source.SixDFGS)).toBeLessThan(800);
    expect(sourceMaxDistanceMpc(Source.SDSS)).toBeGreaterThan(2000);
  });
});

describe('source mask helpers', () => {
  it('ALL_VISIBLE_MASK has every defined source bit set', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.SDSS)).toBe(true);
    expect(maskHas(ALL_VISIBLE_MASK, Source.TwoMPZ)).toBe(true);
  });
  it('maskHas / maskWith / maskWithout flip individual bits', () => {
    let m = 0;
    expect(maskHas(m, Source.SDSS)).toBe(false);
    m = maskWith(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    m = maskWithout(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(false);
  });
});
