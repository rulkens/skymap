import { describe, expect, it } from 'vitest';
import { surfaceEffectsKey } from '../../../src/utils/scene/surfaceEffectsKey';

describe('surfaceEffectsKey', () => {
  it('is order-insensitive', () => {
    expect(surfaceEffectsKey(['nightLights', 'materialMap', 'cloudShadows'])).toBe(
      surfaceEffectsKey(['cloudShadows', 'materialMap', 'nightLights']),
    );
  });
});
