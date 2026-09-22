import { describe, it, expect } from 'vitest';

import { cosmicWebDensityRequest } from '../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityRequest';
import { MCPM_ENTRY } from '../../../../src/layers/cosmicWebDensity/sources/mcpm';
import { MCPM_WORKBENCH_ENTRY } from '../../../../src/layers/cosmicWebDensity/sources/mcpm-workbench';

describe('cosmicWebDensityRequest', () => {
  it('a tiered row carries the tier, an untiered row carries none', () => {
    expect(cosmicWebDensityRequest(MCPM_ENTRY, 'medium')).toEqual({
      binBaseName: 'mcpm',
      tier: 'medium',
    });
    const untiered = cosmicWebDensityRequest(MCPM_WORKBENCH_ENTRY, 'medium');
    expect(untiered).toEqual({ binBaseName: 'mcpm-workbench' });
    expect(untiered).not.toHaveProperty('tier');
  });
});
