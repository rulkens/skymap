// bodyRowChip — the scene-body palette row's category chip.
//
// The chip used to be `star ? star.constellation : 'Solar System'`, which was a
// false claim for anything outside the Sun's subtree and printed the seed
// table's 'None' sentinel for the Sun itself. These pin the two branches and the
// totality that lets the region fallback replace the literal rather than sit
// beside it.

import { describe, it, expect } from 'vitest';
import { bodyRowChip } from '../../../../src/components/CommandPalette/utils/bodyRowChip';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';

describe('bodyRowChip', () => {
  it("reads Galactic Centre for Sgr A*, not 'Solar System'", () => {
    expect(bodyRowChip('sgr-a-star')).toBe('Galactic Centre');
  });

  it('keeps a famous star on its constellation', () => {
    // The region fallback must not swallow this branch: routing famous stars
    // through their region would trade 'Canis Major' for 'Solar Neighbourhood'.
    expect(bodyRowChip('sirius')).toBe('Canis Major');
  });

  it("routes the Sun's 'None' sentinel to its region", () => {
    expect(bodyRowChip('sun')).toBe('Solar System');
  });

  it('resolves a chip for every scene body', () => {
    // Totality end to end: a body no region claims yields undefined silently, so
    // a chip-less row is the failure mode this catches — never a throw.
    const chipless = SCENE_BODIES.filter((body) => bodyRowChip(body.id) === undefined);
    expect(chipless.map((body) => body.id)).toEqual([]);
  });
});
