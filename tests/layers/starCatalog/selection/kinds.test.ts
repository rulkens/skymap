import { describe, expect, it } from 'vitest';
import { starCatalogSelectionKinds } from '../../../../src/layers/starCatalog/selection/kinds';
import { Source } from '../../../../src/data/source';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { apparentMagnitudeFromAbs } from '../../../../src/utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../../src/utils/star/spectralClassFromBpRp';
import { starRowDriver } from '../../../fixtures/starRowDriver';
import type { StarCatalogSelectionRow } from '../../../../src/layers/starCatalog/@types/StarCatalogSelectionRow';

const [kind] = starCatalogSelectionKinds;

type StarRow = StarCatalogSelectionRow;

function starRow(
  source: StarRow['source'],
  index: number,
  id: string | null,
  label: string,
  positionMpc: StarRow['positionMpc'],
  radiusM: number,
  photometry: { absMag: number; bpRp: number } | null = null,
): StarRow {
  return {
    type: 'starCatalog',
    source,
    index,
    id,
    label,
    positionMpc,
    radiusM,
    ...photometry,
    radiusMpc: radiusM * SCALE_UNITS.M_TO_MPC,
    driver: starRowDriver(id, radiusM),
  };
}

// 10 pc out, so the distance modulus is zero and apparentMag === absMag.
const gaiaRow = starRow(
  Source.GaiaStars,
  7,
  null,
  'Field star',
  [10 * SCALE_UNITS.PC_TO_MPC, 0, 0],
  696340000,
  { absMag: 4.83, bpRp: 0.82 },
);
const siriusRow = starRow(
  Source.FamousStar,
  3,
  'sirius',
  'Sirius',
  [2.64 * SCALE_UNITS.PC_TO_MPC, 0, 0],
  1.19e9,
);
const s2Row = starRow(Source.SStar, 0, 's2', 'S2', [0.0025, 0, 0], 4.2e9);
const sunRow = starRow(Source.Sun, 0, 'sun', 'Sun', [0, 0, 0], 696340000);

describe('starCatalog selection kind', () => {
  it('a seeded star may carry a label, a Gaia star may not', () => {
    expect(kind!.mayHaveLabel({ type: 'starCatalog', source: Source.FamousStar, index: 0 })).toBe(
      true,
    );
    expect(kind!.mayHaveLabel({ type: 'starCatalog', source: Source.GaiaStars, index: 0 })).toBe(
      false,
    );
  });

  // `detail` is chosen by what the row HAS, never by its catalog — so a source that stopped
  // carrying photometry, or a seeded star whose sidecar/orbit lookup broke, lands wrong here.
  it.each([
    ['survey photometry', gaiaRow, 'photometry'],
    ['a compiled-in orbit', s2Row, 'orbit'],
    // A seeded star's curated entry is the card container's join, never the target's.
    ['a seeded star with no orbit', siriusRow, 'none'],
    ['the Sun', sunRow, 'none'],
  ] as const)('star row with %s → detail.kind %s', (_label, row, detailKind) => {
    expect(kind!.toFocusable(row).detail.kind).toBe(detailKind);
  });

  it('survey-star row derives distance, apparent magnitude and spectral class', () => {
    const info = kind!.toFocusable(gaiaRow);
    expect(info.detail.kind).toBe('photometry');
    if (info.detail.kind !== 'photometry') return;
    expect(info.distancePc).toBeCloseTo(10, 9);
    expect(info.detail.apparentMag).toBeCloseTo(4.83, 9);
    expect(info.detail.apparentMag).toBe(apparentMagnitudeFromAbs(4.83, info.distancePc));
    expect(info.detail.spectralClass).toBe(spectralClassFromBpRp(0.82));
  });

  it('star row carries its identity and ref through to the card view-model', () => {
    // `id` + `label` ride the row rather than the async sidecar, so a seeded star's
    // headline and its `star-<id>` link work before the JSON lands.
    expect(kind!.toFocusable(siriusRow)).toMatchObject({
      type: 'starCatalog',
      ref: { type: 'starCatalog', source: Source.FamousStar, index: 3 },
      id: 'sirius',
      displayName: 'Sirius',
    });
  });
});
