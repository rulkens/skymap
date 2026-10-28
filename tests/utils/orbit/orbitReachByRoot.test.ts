import { describe, it, expect } from 'vitest';

import { orbitReachByRoot } from '../../../src/utils/orbit/orbitReachByRoot';
import type { AnchorBody } from '../../../src/@types/scene/AnchorBody';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

// Synthetic two-anchor scene: the Sun at the render origin and a Sgr A*-like
// anchor 8.178e-3 Mpc away, one orbit hanging off each. Synthetic rather than
// the real roster because `orbitReachByRoot` takes its tables as parameters
// precisely so the far-anchored case is pinned by hand-computed apoapses, not by
// whatever the seeded S-star table currently holds.
const SYNTHETIC_ANCHORS: readonly AnchorBody[] = [
  { id: asSceneBodyId('sun'), positionMpc: [0, 0, 0] },
  { id: 'galactic-centre', positionMpc: [8.178e-3, 0, 0] },
];

function makeElements(id: string, focusId: string, semiMajorMpc: number): OrbitalElements {
  return {
    id: asSceneBodyId(id),
    focusId: asSceneBodyId(focusId),
    semiMajorMpc,
    eccentricity: 0.5,
    inclinationRad: 0,
    ascendingNodeRad: 0,
    argPeriapsisRad: 0,
    meanAnomalyRad: 0,
    color: [1, 1, 1],
  };
}

describe('orbitReachByRoot', () => {
  it('a Galactic Centre orbit does not inflate the solar-system trail reach', () => {
    const nearOrbit = makeElements('neptune', 'sun', 1e-10);
    const farOrbit = makeElements('s2', 'galactic-centre', 3e-9);

    const reach = orbitReachByRoot(SYNTHETIC_ANCHORS, [nearOrbit, farOrbit]);

    // The Sun's reach is its OWN orbits' apoapsis, untouched by the far root's
    // twenty-times-larger one: a single scene-wide maximum would hand it 4.5e-9
    // and collapse the orbit-trail cull for every camera near the Sun.
    expect(reach.get(asSceneBodyId('sun'))).toBeCloseTo(1.5e-10, 20);
    // And the far root's reach is measured from ITS anchor — an apoapsis, not
    // the 8.178e-3 Mpc that anchor sits at from the render origin.
    expect(reach.get('galactic-centre')).toBeCloseTo(4.5e-9, 20);
  });

  it("keys a star's planet, and its moon, to that star, not to the Sun", () => {
    const anchors: readonly AnchorBody[] = [
      ...SYNTHETIC_ANCHORS,
      { id: asSceneBodyId('host'), positionMpc: [1.2e-5, 0, 0] },
    ];
    const planet = makeElements('planet', 'host', 2e-13);
    const moon = makeElements('moon-of-planet', 'planet', 1e-14);

    const reach = orbitReachByRoot(anchors, [planet, moon]);

    expect(reach.get(asSceneBodyId('host'))).toBeCloseTo(3e-13 + 1.5e-14, 25);
    expect(reach.has(asSceneBodyId('sun'))).toBe(false);
  });
});
