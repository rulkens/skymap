/**
 * Body picks pack a code the Layer's allocator hands out, over an index into the seed table that
 * code's registry row names. Codes from 40 up make a stamp or decode that still reads a catalog
 * value fail, and the caption and sphere halves of one body must name the same ref.
 */

import { describe, expect, it } from 'vitest';
import { bodySelectionRow } from '../../../../../src/layers/body/selection/present/bodySelectionRow';
import { bodyCodeOf } from '../../../../../src/layers/body/selection/present/bodyCodeOf';
import { sceneBodyLabels } from '../../../../../src/layers/body/labels/present/sceneBodyLabels';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { fakePickCode } from '../../../../support/fakePickCode';
import { bodyPickCodes } from '../../../../support/layerPickCodes';

const pickCodes = bodyPickCodes(fakePickCode());
const row = bodySelectionRow({ pickCodes });
const bodyRef = (id: string) => ({ type: 'body', id: asSceneBodyId(id) }) as const;

describe('bodySelectionRow pick codes', () => {
  it('body refs round-trip under non-catalog codes', () => {
    for (const id of [SCENE_EARTH.id, 'moon', 'phobos', 'vesta']) {
      const ref = bodyRef(id);
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(pick.sourceCode).toBeGreaterThanOrEqual(40);
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

  it("a body caption's pick id resolves to the same ref as its sphere's pick", () => {
    const labels = sceneBodyLabels(deriveBodyStates(CONST_J2000), bodyCodeOf(pickCodes));
    expect(labels).toHaveLength(1 + SCENE_PLANETS.length);
    for (const label of labels) {
      const ref = bodyRef(label.id.replace('sceneBody-', ''));
      expect(row.resolvePick(unpackPick(label.pickId!)!)).toEqual(ref);
      expect(label.pickId).toBe(row.encodePick(ref));
    }
  });
});
