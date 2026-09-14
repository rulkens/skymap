import { describe, it, expect } from 'vitest';

import { orbitReachByRegion } from '../../../src/utils/orbit/orbitReachByRegion';
import type { AnchorBody } from '../../../src/@types/scene/AnchorBody';
import type { BodyRegion } from '../../../src/@types/scene/BodyRegion';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';

// Synthetic two-anchor scene: the Sun at the render origin and a Sgr A*-like
// anchor 8.178e-3 Mpc away, one orbit hanging off each. Synthetic rather than
// the real roster because `orbitReachByRegion` takes its tables as parameters
// precisely so the far-anchored case is pinned by hand-computed apoapses, not by
// whatever the seeded S-star table currently holds.
const SYNTHETIC_ANCHORS: readonly AnchorBody[] = [
  { id: 'sun', positionMpc: [0, 0, 0] },
  { id: 'sgr-a-star', positionMpc: [8.178e-3, 0, 0] },
];

function makeElements(id: string, focusId: string, semiMajorMpc: number): OrbitalElements {
  return {
    id,
    focusId,
    semiMajorMpc,
    eccentricity: 0.5,
    inclinationRad: 0,
    ascendingNodeRad: 0,
    argPeriapsisRad: 0,
    meanAnomalyRad: 0,
    color: [1, 1, 1],
  };
}

function makeRegion(id: BodyRegion['id'], anchorId: string, memberIds: string[]): BodyRegion {
  return { id, label: id, anchorId, memberIds, extentMpc: 0 };
}

describe('orbitReachByRegion', () => {
  it('a Galactic Centre orbit does not inflate the solar-system trail reach', () => {
    const nearOrbit = makeElements('neptune', 'sun', 1e-10);
    const farOrbit = makeElements('s2', 'sgr-a-star', 3e-9);
    const solarSystem = makeRegion('solar-system', 'sun', ['sun', 'neptune']);
    const galacticCentre = makeRegion('galactic-centre', 'sgr-a-star', ['sgr-a-star', 's2']);
    const regionOf = (bodyId: string): BodyRegion | null =>
      [solarSystem, galacticCentre].find((region) => region.memberIds.includes(bodyId)) ?? null;

    const reach = orbitReachByRegion(SYNTHETIC_ANCHORS, [nearOrbit, farOrbit], regionOf);

    // The solar system's reach is its OWN orbits' apoapsis, untouched by the far
    // region's twenty-times-larger one: a single scene-wide maximum would hand it
    // 4.5e-9 and collapse the orbit-trail cull for every camera near the Sun.
    expect(reach.get(solarSystem)).toBeCloseTo(1.5e-10, 20);
    // And the far region's reach is measured from ITS anchor — an apoapsis, not
    // the 8.178e-3 Mpc that anchor sits at from the render origin.
    expect(reach.get(galacticCentre)).toBeCloseTo(4.5e-9, 20);
  });
});
