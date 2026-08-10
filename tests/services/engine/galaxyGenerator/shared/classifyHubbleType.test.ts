/**
 * classifyHubbleType — collapses the raw Hubble-type string into one of the
 * five generative families, extracted from galaxy-model.js:58-65. One
 * assertion per family, plus the spike's "unknown string falls back to
 * spiral" behaviour (model.js:64).
 */
import { describe, expect, it } from 'vitest';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';

describe('classifyHubbleType', () => {
  it('E0 and E7 classify as elliptical', () => {
    expect(classifyHubbleType('E0')).toBe('elliptical');
    expect(classifyHubbleType('E7')).toBe('elliptical');
  });

  it('S0 classifies as lenticular', () => {
    expect(classifyHubbleType('S0')).toBe('lenticular');
  });

  it('Irr classifies as irregular', () => {
    expect(classifyHubbleType('Irr')).toBe('irregular');
  });

  it('SBa and SBc classify as barred', () => {
    expect(classifyHubbleType('SBa')).toBe('barred');
    expect(classifyHubbleType('SBc')).toBe('barred');
  });

  it('Sa and Sc classify as spiral', () => {
    expect(classifyHubbleType('Sa')).toBe('spiral');
    expect(classifyHubbleType('Sc')).toBe('spiral');
  });

  it('an unrecognized type string falls back to spiral', () => {
    expect(classifyHubbleType('bogus')).toBe('spiral');
  });
});
