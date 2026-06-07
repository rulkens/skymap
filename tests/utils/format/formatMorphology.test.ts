import { describe, it, expect } from 'vitest';
import { formatMorphology } from '../../../src/utils/format/formatMorphology';

describe('formatMorphology', () => {
  it('labels barred spirals from an SB prefix', () => {
    expect(formatMorphology('SBb')).toBe('Barred spiral (SBb)');
    expect(formatMorphology('SBcd')).toBe('Barred spiral (SBcd)');
    expect(formatMorphology('SBm')).toBe('Barred spiral (SBm)');
  });

  it('labels unbarred and intermediate spirals as Spiral', () => {
    expect(formatMorphology('Sbc')).toBe('Spiral (Sbc)');
    expect(formatMorphology('Sa')).toBe('Spiral (Sa)');
    expect(formatMorphology('SABb')).toBe('Spiral (SABb)');
    expect(formatMorphology('S?')).toBe('Spiral (S?)');
  });

  it('labels ellipticals and lenticulars', () => {
    expect(formatMorphology('E')).toBe('Elliptical (E)');
    expect(formatMorphology('S0')).toBe('Lenticular (S0)');
    expect(formatMorphology('S0-a')).toBe('Lenticular (S0-a)');
    expect(formatMorphology('E-S0')).toBe('Elliptical/lenticular (E-S0)');
  });

  it('labels irregulars', () => {
    expect(formatMorphology('I')).toBe('Irregular (I)');
    expect(formatMorphology('IB')).toBe('Irregular (IB)');
  });

  it('labels dwarf morphologies', () => {
    expect(formatMorphology('dSph')).toBe('Dwarf spheroidal (dSph)');
    expect(formatMorphology('dE3')).toBe('Dwarf elliptical (dE3)');
  });

  it('passes an unrecognised or empty code through untouched', () => {
    expect(formatMorphology('???')).toBe('???');
    expect(formatMorphology('')).toBe('');
  });
});
