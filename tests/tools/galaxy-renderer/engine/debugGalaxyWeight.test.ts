/**
 * debugGalaxyWeight — the contract that matters is MAX, not SUM: two views
 * live at once must not double-dim the galaxy.
 */
import { describe, expect, it } from 'vitest';
import { debugGalaxyWeight } from '../../../../tools/galaxy-renderer/src/engine/frame/debugGalaxyWeight';
import { DEFAULT_RENDER_SETTINGS } from '../../../../tools/galaxy-renderer/src/data/defaultRenderSettings';

describe('debugGalaxyWeight', () => {
  it('two views live at 0.6 each yield 0.4, not the sum-implied 0', () => {
    const render = {
      ...DEFAULT_RENDER_SETTINGS,
      dustViewIntensity: 0.6,
      sfMapViewIntensity: 0.6,
    };
    expect(debugGalaxyWeight(render)).toBeCloseTo(0.4, 12);
  });
});
