/**
 * Pins the one thing that would silently corrupt the bubble-view overlay:
 * relics and cavities packed contiguously in that order, at the
 * BUBBLE_RECORD_FLOATS stride, with kind 0 then kind 1 — bubblePresent.wesl
 * reads `@location(1)` as a flat lane, so a swapped order or wrong stride
 * repaints cavities as relics (or worse) with no error.
 */
import { describe, expect, it } from 'vitest';
import {
  BUBBLE_RECORD_FLOATS,
  packBubbleInstances,
} from '../../../../../tools/galaxy-renderer/src/engine/field/packBubbleInstances';
import type { DustBubblePlacement } from '../../../../../src/services/engine/galaxyGenerator/v2/dustBubblePlacements';

describe('packBubbleInstances', () => {
  it('packs relics then cavities contiguously, at stride BUBBLE_RECORD_FLOATS, with kind 0 then 1', () => {
    const relics: readonly DustBubblePlacement[] = [
      { center: [1, 2, 3], radius: 4 },
      { center: [5, 6, 7], radius: 8 },
    ];
    const cavities: readonly DustBubblePlacement[] = [{ center: [9, 10, 11], radius: 12 }];

    const out = packBubbleInstances(relics, cavities);

    expect(out.length).toBe((relics.length + cavities.length) * BUBBLE_RECORD_FLOATS);
    // Relic 0 at record 0.
    expect(Array.from(out.slice(0, 5))).toEqual([1, 2, 3, 4, 0]);
    // Relic 1 at record 1.
    expect(Array.from(out.slice(5, 10))).toEqual([5, 6, 7, 8, 0]);
    // Cavity 0 at record 2 — after BOTH relics, kind 1.
    expect(Array.from(out.slice(10, 15))).toEqual([9, 10, 11, 12, 1]);
  });
});
