/**
 * The capture table's two cross-file contracts: view-slot ranges against the
 * uniform ring's capacity, and each row's target against the render-target
 * table. Both break silently — a slot collision corrupts another view's
 * uniforms, a stale target id throws only once the band opens.
 */

import { describe, expect, it } from 'vitest';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../src/data/rendering/cubemapCaptures';
import { renderTargetRows } from '../../../src/services/gpu/renderTargets';
import { VIEW_SLOT_COUNT } from '../../../src/utils/gpu/createViewSlotUniformRing';

const ROWS = Object.values(CUBEMAP_CAPTURES);

describe('CUBEMAP_CAPTURES', () => {
  it('claims six disjoint view slots per row, all inside VIEW_SLOT_COUNT', () => {
    const claimed = new Set<number>();
    for (const row of ROWS) {
      for (let i = 0; i < ALL_CUBE_FACES.length; i++) {
        const slot = row.viewSlotBase + i;
        expect(slot).toBeGreaterThanOrEqual(1);
        expect(slot).toBeLessThan(VIEW_SLOT_COUNT);
        expect(claimed.has(slot)).toBe(false);
        claimed.add(slot);
      }
    }
  });

  it('names a declared render-target row as its capture target', () => {
    const ids = new Set(renderTargetRows('bgra8unorm').map((spec) => spec.id));
    for (const row of ROWS) expect(ids.has(row.target)).toBe(true);
  });
});
