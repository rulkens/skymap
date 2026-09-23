/**
 * The capture table's two cross-file contracts: view-slot ranges against the
 * uniform ring's capacity, and each row's target against the render-target
 * table. Both break silently — a slot collision corrupts another view's
 * uniforms, a stale target id throws only once the band opens.
 */

import { describe, expect, it } from 'vitest';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../src/data/rendering/cubemapCaptures';
import { DOME_FACE_COUNT } from '../../../src/data/rendering/domeFaces';
import { DOME_PARAMS } from '../../../src/data/rendering/domeParams';
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

  // A slot collision corrupts another view's uniforms with no error anywhere
  // (module header), so the dome's five face slots must land disjoint from
  // every capture row's six — same discipline as the capture-vs-capture check
  // above.
  it('dome faces claim five slots disjoint from every capture row, inside VIEW_SLOT_COUNT', () => {
    const claimed = new Set<number>();
    for (const row of ROWS) {
      for (let i = 0; i < ALL_CUBE_FACES.length; i++) claimed.add(row.viewSlotBase + i);
    }
    for (let i = 0; i < DOME_FACE_COUNT; i++) {
      const slot = DOME_PARAMS.viewSlotBase + i;
      expect(slot).toBeGreaterThanOrEqual(1);
      expect(slot).toBeLessThan(VIEW_SLOT_COUNT);
      expect(claimed.has(slot)).toBe(false);
    }
  });

  it('names a declared render-target row as its capture target', () => {
    const ids = new Set(renderTargetRows('bgra8unorm').map((spec) => spec.id));
    // Sky rows only: a probe's faces are its subject's own cube, not a row here.
    for (const row of ROWS) {
      if (row.kind === 'sky') expect(ids.has(row.target)).toBe(true);
    }
  });
});
