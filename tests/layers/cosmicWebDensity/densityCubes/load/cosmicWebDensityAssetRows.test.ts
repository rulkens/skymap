/**
 * cosmicWebDensityAssetRows — the tiered/untiered request builders.
 */

import { describe, it, expect } from 'vitest';

import { cosmicWebDensityAssetRows } from '../../../../../src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows';
import type { CosmicWebDensityRuntime } from '../../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';

// Only `slot` reads the runtime, and nothing here inspects it.
const ROWS = cosmicWebDensityAssetRows({ slots: {} } as unknown as CosmicWebDensityRuntime);

describe('cosmicWebDensityAssetRows', () => {
  it('a tiered row carries the tier, an untiered row carries none', () => {
    const mcpm = ROWS.find((row) => row.key === 'mcpm')!;
    expect(mcpm.req('medium')).toEqual({ binBaseName: 'mcpm', tier: 'medium' });
    const workbench = ROWS.find((row) => row.key === 'mcpm-workbench')!;
    const untiered = workbench.req('medium');
    expect(untiered).toEqual({ binBaseName: 'mcpm-workbench' });
    expect(untiered).not.toHaveProperty('tier');
  });
});
