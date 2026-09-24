/**
 * blackHoleSelectionRow — the three ways the Galactic Centre is reached (a
 * pick, a deep link, a focus) all land on this row, and each fails silently:
 * a stale pick resolves to nothing, a mis-spelled link falls through to the
 * galaxy decoder, and a wrong footprint moves arrival by orders of magnitude.
 */

import { describe, it, expect } from 'vitest';

import { blackHoleSelectionRow } from '../../../../src/layers/blackHoles/present/blackHoleSelectionRow';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../src/data/places/galacticCentre';
import { SGR_A_STAR_MASS_SOLAR } from '../../../../src/data/bodies/sgrAStarMassSolar';
import { SOURCE_REGISTRY, Source } from '../../../../src/data/sources';
import {
  packSelection,
  unpackPick,
  PICK_SENTINEL_OFFSET,
} from '../../../../src/data/selectionEncoding';
import { focusFraming } from '../../../../src/services/engine/camera/focusFraming';
import { bodyLikeFraming } from '../../../../src/services/engine/camera/bodyLikeFraming';
import { schwarzschildRadiusM } from '../../../../src/utils/physics/schwarzschildRadiusM';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

const ROW = blackHoleSelectionRow();
const SGR_A_STAR_REF = { type: 'blackHole', id: 'sgr-a-star' } as const;

describe('blackHoleSelectionRow', () => {
  it('resolves a Source.SgrAStar pick to the Sgr A* ref', () => {
    const pick = unpackPick(packSelection(Source.SgrAStar, 0 + PICK_SENTINEL_OFFSET))!;
    expect(ROW.pickSources).toContain(pick.sourceCode);
    expect(ROW.resolvePick(SOURCE_REGISTRY[Source.SgrAStar], pick)).toEqual(SGR_A_STAR_REF);
  });

  it('focus id round-trips', () => {
    const focusId = ROW.focusId!;
    expect(focusId.encode(SGR_A_STAR_REF)).toBe('blackhole-sgr-a-star');
    expect(focusId.decode('blackhole-sgr-a-star')).toEqual(SGR_A_STAR_REF);
    expect(focusId.claims('body-sgr-a-star')).toBe(false);
  });

  it('extracted row poses at the galactic centre and arrives at 30.4 r_s', () => {
    const row = ROW.extractRow(SGR_A_STAR_REF, CONST_J2000)!;
    if (row.type !== 'blackHole') throw new Error('expected the blackHole arm');
    expect(row.positionMpc).toEqual(GALACTIC_CENTRE_ANCHOR.positionMpc);
    expect(row.driver.poseId).toBe(GALACTIC_CENTRE_ANCHOR.id);

    const fov = 0.8;
    const rS = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);
    expect(focusFraming(row, fov).distance).toBe(
      bodyLikeFraming(GALACTIC_CENTRE_ANCHOR.positionMpc, rS, fov, 30.4).distance,
    );
  });
});
