/**
 * cosmicWebDensityAssetRows — the request each row builds from its storage and the tier.
 */

import { describe, it, expect } from 'vitest';

import { cosmicWebDensityAssetRows } from '../../../../../src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows';
import type { CosmicWebDensityRuntime } from '../../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';

// Only `slot` reads the runtime, and nothing here inspects it.
const ROWS = cosmicWebDensityAssetRows({ slots: {} } as unknown as CosmicWebDensityRuntime);

describe('cosmicWebDensityAssetRows', () => {
  it('medium and large ask for the same pyramid level; small asks for level 2', () => {
    const mcpm = ROWS.find((row) => row.key === 'mcpm')!;
    const level1 = { storage: 'pyramid', binBaseName: 'mcpm', baseLevel: 1 };
    expect(mcpm.req('medium')).toEqual(level1);
    expect(mcpm.req('large')).toEqual(level1);
    expect(mcpm.req('small')).toEqual({ ...level1, baseLevel: 2 });
  });

  it('the workbench row asks for its .scfd at every tier', () => {
    const workbench = ROWS.find((row) => row.key === 'mcpm-workbench')!;
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(workbench.req(tier)).toEqual({ storage: 'scfd', binBaseName: 'mcpm-workbench' });
    }
  });
});
