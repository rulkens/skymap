/**
 * bodyMovesThisFrame — unit tests for the "does the clock propagate it" predicate.
 *
 * The Sun case is the load-bearing one: the Sun is a scene body with a position
 * but no `ORBITAL_ELEMENTS` row, so a predicate written against the derived
 * state map would call it moving the moment the Sun is seeded there as an
 * anchor, silently activating the follow driver and the pivot pin for it.
 */

import { describe, it, expect } from 'vitest';

import { bodyMovesThisFrame } from '../../../src/utils/scene/bodyMovesThisFrame';
import type { SelectionRow } from '../../../src/@types/engine/SelectionRow';

function bodyRow(id: string): SelectionRow {
  return { type: 'body', id, label: id, positionMpc: [0, 0, 0], radiusKm: 1 };
}

describe('bodyMovesThisFrame', () => {
  it('a famous star does not move this frame', () => {
    expect(bodyMovesThisFrame(bodyRow('sirius'))).toBe(false);
  });

  it('a planet moves this frame', () => {
    expect(bodyMovesThisFrame(bodyRow('mars'))).toBe(true);
  });

  it('the Sun does not move this frame', () => {
    expect(bodyMovesThisFrame(bodyRow('sun'))).toBe(false);
  });
});
