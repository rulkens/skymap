/**
 * focusInSubtree — the chooser's focus rule (spec §4.8). A rover focus must
 * KEEP its planet's arm; the incumbent equality released it, which is what made
 * the Mars arm unreachable with Curiosity focused (spec §0's premise correction).
 */

import { describe, it, expect, vi } from 'vitest';

// The cycle case needs a bad seed the authored tables cannot produce; every
// other case runs against the real driver chain.
vi.mock('../../../src/data/bodies/positionDrivers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/data/bodies/positionDrivers')>();
  return { ...actual, bodyHostId: vi.fn(actual.bodyHostId) };
});

import { focusInSubtree } from '../../../src/utils/camera/focusInSubtree';
import { bodyHostId } from '../../../src/data/bodies/positionDrivers';
import type { BodyId } from '../../../src/@types/data/body/BodyId';

const id = (name: string): BodyId => name as BodyId;

describe('focusInSubtree', () => {
  it('a rover keeps its host planet, and its host star', () => {
    // `curiosity → mars → sun`: the whole chain, not just the first hop.
    expect(focusInSubtree(id('curiosity'), id('mars'))).toBe(true);
    expect(focusInSubtree(id('curiosity'), id('sun'))).toBe(true);
    expect(focusInSubtree(id('curiosity'), id('curiosity'))).toBe(true);
  });

  it('a focus outside the subtree does not', () => {
    expect(focusInSubtree(id('earth'), id('mars'))).toBe(false);
    // The other direction too: a planet is not inside its own rover's subtree.
    expect(focusInSubtree(id('mars'), id('curiosity'))).toBe(false);
  });

  it('no focus constrains no rung', () => {
    expect(focusInSubtree(null, id('mars'))).toBe(true);
  });

  it('terminates on a cyclic driver chain', () => {
    vi.mocked(bodyHostId).mockImplementation((from) => (from === 'a' ? 'b' : 'a'));
    expect(focusInSubtree(id('a'), id('mars'))).toBe(false);
  });
});
