// bodyRowChip — the scene-body palette row's category chip.
//
// The chip used to be `star ? star.constellation : 'Solar System'`, which was a
// false claim for anything outside the Sun's subtree and printed the seed
// table's 'None' sentinel for the Sun itself. These pin the two branches and the
// totality that lets the region fallback replace the literal rather than sit
// beside it — plus the one body that ANCHORS its own region, where the fallback
// would otherwise print the row's own name back at it.

import { describe, it, expect } from 'vitest';
import { bodyRowChip } from '../../../../src/components/CommandPalette/utils/bodyRowChip';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SGR_A_STAR_ENTRY } from '../../../../src/data/sources/sgr-a-star';

describe('bodyRowChip', () => {
  it('keeps a famous star on its constellation', () => {
    // The region fallback must not swallow this branch: routing famous stars
    // through their region would trade 'Canis Major' for 'Solar Neighbourhood'.
    expect(bodyRowChip('sirius', 'Sirius')).toBe('Canis Major');
  });

  it("routes the Sun's 'None' sentinel to its region", () => {
    expect(bodyRowChip('sun', 'Sun')).toBe('Solar System');
  });

  it('drops the chip when the region merely restates the row', () => {
    // The Galactic Centre anchors the region named after it, so the fallback
    // resolves to the row's own label — a chip that places nothing. It must be
    // absent rather than printed twice. Derived from the registry: renaming the
    // body carries this, a hardcoded string would not.
    expect(bodyRowChip(SGR_A_STAR_ENTRY.id, SGR_A_STAR_ENTRY.label)).toBeUndefined();
    // The suppression is name-matching, not an id exemption — the same body
    // under any other name still chips its region.
    expect(bodyRowChip(SGR_A_STAR_ENTRY.id, 'Sagittarius A*')).toBe('Galactic Centre');
  });

  it('resolves a chip for every scene body except its own region anchors', () => {
    // Totality end to end: a body no region claims yields undefined silently, so
    // a chip-less row is the failure mode this catches — never a throw. The
    // Galactic Centre is the one legitimate absence (above).
    const chipless = SCENE_BODIES.filter((body) => bodyRowChip(body.id, body.label) === undefined);
    expect(chipless.map((body) => body.id)).toEqual([SGR_A_STAR_ENTRY.id]);
  });
});
