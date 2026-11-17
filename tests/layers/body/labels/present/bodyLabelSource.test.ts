/**
 * A body caption picks what a click on its body does: the pick names the seed table's code and
 * index, and a wrong pair resolves to a plausible, silently wrong body.
 */

import { describe, expect, it } from 'vitest';

import { bodyLabelSource } from '../../../../../src/layers/body/labels/present/bodyLabelSource';
import { bodySelectionRow } from '../../../../../src/layers/body/selection/bodySelectionRow';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { packPickWord } from '../../../../../src/utils/labels/packPickWord';
import { compressBrightness } from '../../../../../src/utils/color/compressBrightness';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import { bodyPickCodes } from '../../../../support/layerPickCodes';

const anchorOf = (position: unknown) => (position as { anchorId: string }).anchorId;

describe('bodyLabelSource', () => {
  it('bodies describe their labels', () => {
    const pickCodes = bodyPickCodes();
    const source = bodyLabelSource({ pickCodes });
    const row = bodySelectionRow({ pickCodes });
    const labels = source.items({} as EngineState).map((item, i) => source.describe(item, i)!);
    expect(labels).toHaveLength(1 + SCENE_PLANETS.length);

    for (const label of labels) {
      const ref = { type: 'body', id: asSceneBodyId(anchorOf(label.position)) } as const;
      expect(packPickWord(label.pick!.code, label.pick!.index)).toBe(row.encodePick(ref));
    }

    const byId = new Map(labels.map((label) => [anchorOf(label.position), label]));
    expect(byId.get(SCENE_EARTH.id)!.fadeKey).toBe('earth');
    expect(byId.get('vesta')!.fadeKey).toBe('small-body');
    const moon = SCENE_PLANETS.find((planet) => planet.id === 'moon')!;
    expect(byId.get('moon')!.color).toEqual([...compressBrightness(moon.albedo, 0.3), 1]);
  });
});
