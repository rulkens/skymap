/**
 * PointOfInterest.union — proves the discriminated-union modelling of
 * `PointOfInterest` does the narrowing we rely on.
 *
 * The type is split on `category`: cluster / supercluster / void carry the
 * extended-structure fields (radius + significance), the cluster arm alone
 * adds `abell`, and famousGalaxy carries the label/size fields instead.  A
 * narrowing function that reads `abell` only compiles because the union
 * discriminates — there is no `abell` on the non-cluster arms to fall back
 * to.  The runtime assertions confirm a constructed cluster surfaces its
 * designation while a void / galaxy fixture has none.
 */

import { describe, it, expect } from 'vitest';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';

// Narrowing helper: `abell` lives on the cluster arm only.  This body type-
// checks solely because `p.category === 'cluster'` narrows `p` to the arm
// that declares `abell`; reading it on the bare union would be a compile
// error.
function abellOf(p: PointOfInterest): string | undefined {
  return p.category === 'cluster' ? p.abell : undefined;
}

describe('PointOfInterest discriminated union', () => {
  it('surfaces abell on the cluster arm', () => {
    const coma: PointOfInterest = {
      id: 'cluster-coma',
      name: 'Coma Cluster',
      category: 'cluster',
      worldPos: [1, 2, 3],
      featured: true,
      significance: 1,
      physicalRadiusMpc: 2,
      apparentRadiusMpc: 5,
      abell: 'A1656',
    };
    expect(abellOf(coma)).toBe('A1656');
  });

  it('has no abell on a void arm', () => {
    const bootes: PointOfInterest = {
      id: 'void-bootes',
      name: 'Boötes Void',
      category: 'void',
      worldPos: [4, 5, 6],
      featured: true,
      significance: 1,
      physicalRadiusMpc: 45,
      apparentRadiusMpc: 45,
    };
    expect(abellOf(bootes)).toBeUndefined();
    expect('abell' in bootes).toBe(false);
  });

  it('has no abell on a famous-galaxy arm', () => {
    const m31: PointOfInterest = {
      id: 'famous-m31',
      name: 'Andromeda',
      category: 'famousGalaxy',
      worldPos: [7, 8, 9],
      featured: true,
      minApparentSizePx: 6,
      apparentDiameterKpc: 40,
    };
    expect(abellOf(m31)).toBeUndefined();
    expect('abell' in m31).toBe(false);
  });

  it('rejects arm-crossing literals at compile time', () => {
    // A famousGalaxy literal carrying a structure-arm field (abell /
    // physicalRadiusMpc / significance) must be a type error — the
    // discriminated union forbids it.  These @ts-expect-error lines fail
    // the typecheck if the union ever stops discriminating.
    const bad: PointOfInterest = {
      id: 'famous-bad',
      name: 'Bad Galaxy',
      category: 'famousGalaxy',
      worldPos: [0, 0, 0],
      featured: true,
      // @ts-expect-error — abell is on the cluster arm only.
      abell: 'A0000',
    };
    expect(bad.category).toBe('famousGalaxy');

    // A void literal missing the required physicalRadiusMpc must also be
    // rejected — the structure arms require it.
    // @ts-expect-error — physicalRadiusMpc is required on the void arm.
    const incomplete: PointOfInterest = {
      id: 'void-bad',
      name: 'Bad Void',
      category: 'void',
      worldPos: [0, 0, 0],
      featured: true,
      significance: 1,
    };
    expect(incomplete.category).toBe('void');
  });
});
