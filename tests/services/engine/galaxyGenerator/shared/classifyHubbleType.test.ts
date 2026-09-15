/**
 * classifyHubbleType — collapses the raw Hubble-type string into one of the
 * five generative families, extracted from galaxy-model.js:58-65. One
 * assertion per family, plus the spike's "unknown string falls back to
 * spiral" behaviour (model.js:64).
 */
import { describe, expect, it } from 'vitest';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';

describe('classifyHubbleType', () => {
  it('S0 classifies as lenticular', () => {
    expect(classifyHubbleType('S0')).toBe('lenticular');
  });

  it('SBa and SBc classify as barred', () => {
    expect(classifyHubbleType('SBa')).toBe('barred');
    expect(classifyHubbleType('SBc')).toBe('barred');
  });

  it('an unrecognized type string falls back to spiral', () => {
    expect(classifyHubbleType('bogus')).toBe('spiral');
  });
});
