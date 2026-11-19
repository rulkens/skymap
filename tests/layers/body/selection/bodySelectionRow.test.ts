/**
 * Body picks pack a code the Layer's allocator hands out, over an index into the seed table that
 * code's registry row names. Codes from 40 up make a stamp or decode that still reads a catalog
 * value fail.
 */

import { describe, expect, it } from 'vitest';
import { bodySelectionRow } from '../../../../src/layers/body/selection/bodySelectionRow';
import { bodyCodeOf } from '../../../../src/layers/body/selection/present/bodyCodeOf';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { bodyPickCodes } from '../../../support/layerPickCodes';
import { relErr } from '../../../support/relErr';
import type { PlacedRow } from '../../../../src/@types/engine/selection/PlacedRow';

const pickCodes = bodyPickCodes();
const row = bodySelectionRow({ pickCodes });
const bodyRef = (id: string) => ({ type: 'body', id: asSceneBodyId(id) }) as const;

describe('bodySelectionRow pick codes', () => {
  it('body refs round-trip under allocator codes', () => {
    for (const id of [SCENE_EARTH.id, 'moon', 'phobos', 'vesta']) {
      const ref = bodyRef(id);
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(row.resolvePick(pick)).toEqual(ref);
    }
  });

  it('pickSources hold the codes the earth and planet stamps use, and the small-body row', () => {
    const stamped = ['earth', 'moon'].map(
      (id) => unpackPick(row.encodePick(bodyRef(id))!)!.sourceCode,
    );
    expect(row.pickSources).toHaveLength(3);
    expect(row.pickSources).toEqual(expect.arrayContaining(stamped));
  });

  it("a meshed asteroid's number link opens its body; other asteroid numbers are not its claim", () => {
    const opens = { 1: 'ceres', 4: 'vesta', 101955: 'bennu', 134340: 'pluto' };
    for (const [number, id] of Object.entries(opens)) {
      expect(row.focusId!.claims(`asteroid-${number}`)).toBe(true);
      expect(row.focusId!.decode(`asteroid-${number}`)).toEqual({ kind: 'hit', ref: bodyRef(id) });
    }
    expect(row.focusId!.encode(bodyRef('vesta'))).toBe('body-vesta');
    for (const id of ['asteroid-433', 'asteroid-04', 'asteroid-']) {
      expect(row.focusId!.claims(id)).toBe(false);
    }
  });

  it('places Earth at its footprint radius, in Mpc', () => {
    const earth = row.extractRow(bodyRef(SCENE_EARTH.id), CONST_J2000) as PlacedRow;
    expect(relErr(earth.radiusMpc, 2.067568250898234e-16)).toBeLessThan(1e-12);
  });
});
