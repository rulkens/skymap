/**
 * A craft caption picks what a click on its mesh does, and only the sampled craft dim when the
 * visitor emphasises the other one: the dim rides the caption's alpha, so a wrong craft dims.
 */

import { packPickWord } from '../../../../../src/data/selectionEncoding';
import { describe, expect, it } from 'vitest';

import { missionLabelSource } from '../../../../../src/layers/missions/craft/present/missionLabelSource';
import { craftPickId } from '../../../../../src/layers/missions/craft/present/craftPickId';
import { MISSION_EMPHASIS_DIM } from '../../../../../src/layers/missions/trails/data/missionTrailStyle';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import { missionsPickCode } from '../../../../support/layerPickCodes';

const stateWith = (craft: string | null) =>
  ({ settings: { missions: { craft } } }) as unknown as EngineState;
const anchorOf = (position: unknown) => (position as { anchorId: string }).anchorId;

describe('missionLabelSource', () => {
  it('missions describe their labels', () => {
    const code = missionsPickCode();
    const source = missionLabelSource(code);
    const describeAll = (state: EngineState) =>
      new Map(
        source.items(state).map((item, i) => {
          const label = source.describe(item, i)!;
          return [anchorOf(label.position), label];
        }),
      );

    for (const [id, label] of describeAll(stateWith(null))) {
      expect(packPickWord(label.pick!.code, label.pick!.index)).toBe(
        craftPickId(asSceneBodyId(id), code),
      );
      expect(label.fadeKey).toBe('craft');
      expect(label.color![3]).toBe(1);
    }

    const emphasised = describeAll(stateWith('voyager1'));
    expect(emphasised.get('voyager1')!.color![3]).toBe(1);
    expect(emphasised.get('voyager2')!.color![3]).toBe(MISSION_EMPHASIS_DIM);
    // A craft with no track is never dimmed by an emphasis on a sampled one.
    expect(emphasised.get('hubble')!.color![3]).toBe(1);
  });
});
