/**
 * debugGalaxyWeight — the contract that matters is MAX, not SUM: two views
 * live at once must not double-dim the galaxy.
 */
import { describe, expect, it } from 'vitest';
import { debugGalaxyWeight } from '../../../../../tools/galaxy-renderer/src/engine/frame/debugGalaxyWeight';

describe('debugGalaxyWeight', () => {
  it('two views live at 0.6 each yield 0.4, not the sum-implied 0', () => {
    expect(debugGalaxyWeight({ dust: 0.6, ismMap: 0.6, orientation: 0, bubble: 0 })).toBeCloseTo(
      0.4,
      12,
    );
  });
});
