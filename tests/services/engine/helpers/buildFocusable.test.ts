import { describe, it, expect } from 'vitest';

import { buildFocusable } from '../../../../src/services/engine/helpers/buildFocusable';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import { apparentMagnitudeFromAbs } from '../../../../src/utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../../src/utils/star/spectralClassFromBpRp';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { FieldStarInfo } from '../../../../src/@types/engine/FieldStarInfo';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyRow } from '../../../fixtures/makeGalaxyRow';

const galaxyRow: GalaxyRow = makeGalaxyRow({
  source: Source.SDSS,
  objId: '1237668',
  x: 10,
  y: 20,
  z: 30,
  redshift: 0.0123,
  magU: 18.1,
  magG: 17.4,
  magR: 16.9,
  magI: 16.6,
  magZ: 16.4,
  diameterKpc: 42,
  axisRatio: 0.7,
  positionAngleDeg: 35,
});

const structure: StructureInfo = {
  type: 'structure',
  category: 'cluster',
  id: 'abell-2065',
  name: 'Corona Borealis',
  worldPos: [1, 2, 3],
  featured: true,
  physicalRadiusMpc: 5,
} as unknown as StructureInfo;

// The body arm builds a BodyInfo for EVERY scene body: a famous star (Sirius),
// the home world (Earth), and a planet (Jupiter) all resolve. The old
// FAMOUS_STAR_IDS gate that mapped Earth/planets to null is lifted now that
// bodies are pickable.
const starRow: SelectionRow = {
  type: 'body',
  id: 'sirius',
  label: 'Sirius',
  positionMpc: [1e-6, 2e-6, 3e-6],
  radiusKm: 1_192_000,
};

const earthRow: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusKm: 6371,
};

const jupiterRow: SelectionRow = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [4e-14, 0, 0],
  radiusKm: 69_911,
};

describe('buildFocusable', () => {
  it('null → null', () => expect(buildFocusable(null)).toBeNull());
  it('galaxy row → GalaxyInfo', () => {
    const info = buildFocusable(galaxyRow);
    expect(info).toMatchObject({ type: 'galaxyCatalog', objID: 1237668n, source: Source.SDSS });
  });
  it('structure row → the StructureInfo as-is', () => {
    expect(buildFocusable(structure)).toBe(structure);
  });
  it('milkyWay row → MILKY_WAY_INFO', () => {
    expect(buildFocusable({ type: 'milkyWay' })).toBe(MILKY_WAY_INFO);
  });

  it('famous-star body row → BodyInfo', () => {
    expect(buildFocusable(starRow)).toEqual({
      type: 'body',
      id: 'sirius',
      label: 'Sirius',
      positionMpc: [1e-6, 2e-6, 3e-6],
      radiusKm: 1_192_000,
    });
  });
  it('resolves Earth and a planet now the star-only guard is lifted', () => {
    // Behaviour change (spec §8.4): the body arm used to gate on FAMOUS_STAR_IDS,
    // so Earth and the planets mapped to null — body-unaware. Bodies are pickable
    // now, so every body row builds a BodyInfo carrying its own label + radius.
    expect(buildFocusable(earthRow)).toEqual({
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [0, 0, 0],
      radiusKm: 6371,
    });
    expect(buildFocusable(jupiterRow)).toEqual({
      type: 'body',
      id: 'jupiter',
      label: 'Jupiter',
      positionMpc: [4e-14, 0, 0],
      radiusKm: 69_911,
    });
  });

  it('survey-star row builds a FieldStarInfo with derived fields', () => {
    // A star placed exactly 10 pc away (10 pc = 10 · PC_TO_MPC Mpc, laid on one
    // axis) so the distance modulus is zero and apparentMag === absMag — the
    // hand-checkable anchor for the derivation.
    const absMag = 4.83;
    const bpRp = 0.82;
    const info = buildFocusable({
      type: 'star',
      index: 7,
      positionMpc: [10 * SCALE_UNITS.PC_TO_MPC, 0, 0],
      absMag,
      bpRp,
      radiusKm: 696340,
    }) as FieldStarInfo;

    expect(info.distancePc).toBeCloseTo(10, 9);
    expect(info.apparentMag).toBeCloseTo(absMag, 9);
    expect(info.apparentMag).toBe(apparentMagnitudeFromAbs(absMag, info.distancePc));
    expect(info.spectralClass).toBe(spectralClassFromBpRp(bpRp));
  });
});
