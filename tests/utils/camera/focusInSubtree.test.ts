/**
 * focusInSubtree — the chooser's focus rule (spec §4.8). A rover focus must
 * KEEP its planet's arm; the incumbent equality released it, which is what made
 * the Mars arm unreachable with Curiosity focused (spec §0's premise correction).
 */

import { describe, it, expect } from 'vitest';

import { focusInSubtree } from '../../../src/utils/camera/focusInSubtree';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

describe('focusInSubtree', () => {
  it('a rover keeps its host planet', () => {
    expect(focusInSubtree(asSceneBodyId('curiosity'), asSceneBodyId('mars'))).toBe(true);
    expect(focusInSubtree(asSceneBodyId('curiosity'), asSceneBodyId('curiosity'))).toBe(true);
  });

  it('a focus outside the subtree does not', () => {
    expect(focusInSubtree(asSceneBodyId('earth'), asSceneBodyId('mars'))).toBe(false);
    // The other direction too: a planet is not inside its own rover's subtree.
    expect(focusInSubtree(asSceneBodyId('mars'), asSceneBodyId('curiosity'))).toBe(false);
  });

  it('an orbiting focus neither admits nor holds its host', () => {
    // Phobos is in Mars's subtree but is not fixed to it: a Mars arm would be
    // left behind, so the walk stops at the first non-surfaceFixed row — and
    // the rover's own chain stops one hop above Mars for the same reason.
    expect(focusInSubtree(asSceneBodyId('phobos'), asSceneBodyId('mars'))).toBe(false);
    expect(focusInSubtree(asSceneBodyId('curiosity'), asSceneBodyId('sun'))).toBe(false);
  });

  it('no focus constrains no rung', () => {
    expect(focusInSubtree(null, asSceneBodyId('mars'))).toBe(true);
  });
});
