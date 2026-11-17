import { describe, expect, it } from 'vitest';
import { surfaceEffectsKey } from '../../../../../../src/layers/body/surfaceTiles/plan/subsystems/surfaceEffectsKey';

describe('surfaceEffectsKey', () => {
  it('is order-insensitive', () => {
    expect(surfaceEffectsKey(['nightLights', 'materialMap', 'cloudShadows'])).toBe(
      surfaceEffectsKey(['cloudShadows', 'materialMap', 'nightLights']),
    );
  });
});
