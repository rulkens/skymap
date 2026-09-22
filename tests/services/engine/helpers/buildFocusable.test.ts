import { describe, it, expect } from 'vitest';

import { buildFocusable } from '../../../../src/services/engine/helpers/buildFocusable';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import { apparentMagnitudeFromAbs } from '../../../../src/utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../../src/utils/star/spectralClassFromBpRp';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { FamousStarMetaEntry } from '../../../../src/@types/loading/FamousStarMetaEntry';
import type { StarInfo } from '../../../../src/@types/engine/StarInfo';
import { Source } from '../../../../src/data/sources';

const structure: StructureInfo = {
  type: 'structure',
  category: 'cluster',
  id: 'abell-2065',
  name: 'Corona Borealis',
  worldPos: [1, 2, 3],
  featured: true,
  physicalRadiusMpc: 5,
} as unknown as StructureInfo;

const NO_META: readonly FamousStarMetaEntry[] = [];

const earthRow: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
};

const jupiterRow: SelectionRow = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [4e-14, 0, 0],
};

const siriusMeta: FamousStarMetaEntry = {
  id: 'sirius',
  names: ['Sirius', 'Alpha Canis Majoris'],
  constellation: 'Canis Major',
  spectralType: 'A1V',
  distancePc: 2.64,
  magV: -1.46,
  absMag: 1.42,
  radiusSolar: 1.71,
  temperatureK: 9940,
  description: 'The brightest star in the night sky.',
};

type StarRow = Extract<SelectionRow, { type: 'starCatalog' }>;

const gaiaRow: StarRow = {
  type: 'starCatalog',
  source: Source.GaiaStars,
  index: 7,
  id: null,
  label: 'Field star',
  positionMpc: [10 * SCALE_UNITS.PC_TO_MPC, 0, 0],
  radiusM: 696340000,
  absMag: 4.83,
  bpRp: 0.82,
};

const siriusRow: StarRow = {
  type: 'starCatalog',
  source: Source.FamousStar,
  index: 3,
  id: 'sirius',
  label: 'Sirius',
  positionMpc: [2.64 * SCALE_UNITS.PC_TO_MPC, 0, 0],
  radiusM: 1.19e9,
};

const s2Row: StarRow = {
  type: 'starCatalog',
  source: Source.SStar,
  index: 0,
  id: 's2',
  label: 'S2',
  positionMpc: [0.0025, 0, 0],
  radiusM: 4.2e9,
};

const sunRow: StarRow = {
  type: 'starCatalog',
  source: Source.Sun,
  index: 0,
  id: 'sun',
  label: 'Sun',
  positionMpc: [0, 0, 0],
  radiusM: 696340000,
};

describe('buildFocusable', () => {
  it('structure row → the StructureInfo as-is', () => {
    expect(buildFocusable(structure, NO_META)).toBe(structure);
  });
  it('milkyWay row → MILKY_WAY_INFO', () => {
    expect(buildFocusable({ type: 'milkyWay' }, NO_META)).toBe(MILKY_WAY_INFO);
  });

  it('body row → BodyInfo for Earth and a planet', () => {
    // The body arm is identity only now: the S-star orbit block moved to the star
    // arm, so a body row carries no `orbit` to lose.
    expect(buildFocusable(earthRow, NO_META)).toEqual({
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [0, 0, 0],
    });
    expect(buildFocusable(jupiterRow, NO_META)).toEqual({
      type: 'body',
      id: 'jupiter',
      label: 'Jupiter',
      positionMpc: [4e-14, 0, 0],
    });
  });

  // The whole point of Task 6: `detail` is chosen by what the row HAS, never by
  // its catalog — so a wired-up source that stopped carrying photometry, or a
  // seeded star whose sidecar/orbit lookup broke, lands on the wrong arm here.
  it.each([
    ['survey photometry', gaiaRow, [siriusMeta], 'photometry'],
    ['a curated sidecar entry', siriusRow, [siriusMeta], 'curated'],
    ['a compiled-in orbit', s2Row, [siriusMeta], 'orbit'],
    ['nothing of its own', sunRow, [siriusMeta], 'none'],
    // Same star, sidecar not landed: the fail-soft path, not a loading state.
    ['a curated star before its sidecar lands', siriusRow, NO_META, 'none'],
  ] as const)('star row with %s → detail.kind %s', (_label, row, meta, kind) => {
    const info = buildFocusable(row, meta) as StarInfo;
    expect(info.detail.kind).toBe(kind);
  });

  it('survey-star row derives distance, apparent magnitude and spectral class', () => {
    // A star placed exactly 10 pc away (10 pc = 10 · PC_TO_MPC Mpc, laid on one
    // axis) so the distance modulus is zero and apparentMag === absMag — the
    // hand-checkable anchor for the derivation.
    const info = buildFocusable(gaiaRow, NO_META) as StarInfo;
    expect(info.detail.kind).toBe('photometry');
    if (info.detail.kind !== 'photometry') return;

    expect(info.distancePc).toBeCloseTo(10, 9);
    expect(info.detail.apparentMag).toBeCloseTo(gaiaRow.absMag!, 9);
    expect(info.detail.apparentMag).toBe(
      apparentMagnitudeFromAbs(gaiaRow.absMag!, info.distancePc),
    );
    expect(info.detail.spectralClass).toBe(spectralClassFromBpRp(gaiaRow.bpRp!));
  });

  it('star row carries the row identity through to the card view-model', () => {
    // `id` + `label` ride the row rather than the async sidecar, so a seeded
    // star's headline and its `star-<id>` link work before the JSON lands.
    const info = buildFocusable(siriusRow, NO_META) as StarInfo;
    expect(info).toMatchObject({
      type: 'starCatalog',
      source: Source.FamousStar,
      index: 3,
      id: 'sirius',
      displayName: 'Sirius',
      radiusM: 1.19e9,
    });
  });
});
